-- Fix Production RPCs to work with new product_stocks schema (ingredient_id vs product_id)

-- 1. Update close_production_order_secure
CREATE OR REPLACE FUNCTION close_production_order_secure(
    p_order_id UUID,
    p_items_usage JSONB,
    p_actual_output_quantity NUMERIC,
    p_location_id UUID,
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
    v_item_data JSONB;
    v_item_record RECORD;
    v_product_id UUID;
    v_order_qty NUMERIC;
    v_total_cost NUMERIC := 0;
    v_item_cost NUMERIC;
    
    r_ingredient RECORD;
    r_product RECORD;
    
    v_stock_unit TEXT;
    v_usage_unit TEXT;
    v_qty_to_deduct NUMERIC;
    v_unit_weight NUMERIC;
    v_base_cost NUMERIC;
    
    v_stock_source_slug TEXT;
BEGIN
    -- Validation
    SELECT product_id, quantity INTO v_product_id, v_order_qty
    FROM production_orders 
    WHERE id = p_order_id AND status = 'open';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordem de produção inválida ou já fechada (Order ID: %, Loc: %).', p_order_id, p_location_id;
    END IF;

    -- Get location slug for legacy updates
    SELECT slug INTO v_stock_source_slug FROM stock_locations WHERE id = p_location_id;

    -- Update Item Usages
    IF p_items_usage IS NOT NULL THEN
        FOR v_item_data IN SELECT * FROM jsonb_array_elements(p_items_usage)
        LOOP
            UPDATE production_order_items
            SET 
                quantity_used = (v_item_data->>'quantity_used')::numeric,
                waste_quantity = (v_item_data->>'waste_quantity')::numeric
            WHERE id = (v_item_data->>'id')::uuid AND order_id = p_order_id;
        END LOOP;
    END IF;

    -- Deduct Stock & Calculate Cost
    FOR v_item_record IN SELECT * FROM production_order_items WHERE order_id = p_order_id
    LOOP
        v_qty_to_deduct := 0;
        v_item_cost := 0;
        
        IF v_item_record.type = 'ingredient' THEN
            SELECT * INTO r_ingredient FROM ingredients WHERE id = v_item_record.item_id;
            
            IF FOUND THEN
                v_stock_unit := lower(r_ingredient.unit);
                v_usage_unit := lower(v_item_record.unit);
                v_unit_weight := COALESCE(r_ingredient.unit_weight, 1);
                
                -- Cost Logic
                v_base_cost := r_ingredient.cost;
                IF v_base_cost IS NULL OR v_base_cost = 0 THEN
                     -- Try dynamic cost from product_stocks (using ingredient_id)
                     SELECT average_cost INTO v_base_cost FROM product_stocks 
                     WHERE ingredient_id = r_ingredient.id AND location_id = p_location_id;
                     
                     IF v_base_cost IS NULL OR v_base_cost = 0 THEN
                        v_base_cost := GREATEST(COALESCE(r_ingredient.cost_danilo, 0), COALESCE(r_ingredient.cost_adriel, 0));
                     END IF;
                END IF;
                
                -- Calculate Cost
                IF v_unit_weight > 0 THEN
                     v_item_cost := (COALESCE(v_base_cost, 0) / v_unit_weight) * (v_item_record.quantity_used + v_item_record.waste_quantity);
                ELSE
                     v_item_cost := COALESCE(v_base_cost, 0) * (v_item_record.quantity_used + v_item_record.waste_quantity);
                END IF;

                -- Stock Logic
                v_qty_to_deduct := v_item_record.quantity_used + v_item_record.waste_quantity;

                -- Generic Conversion Logic
                -- Unified Conversion Logic
                IF v_usage_unit IN ('g', 'ml') THEN
                    IF v_stock_unit IN ('kg', 'l') THEN
                        v_qty_to_deduct := v_qty_to_deduct / 1000.0;
                    ELSIF v_stock_unit NOT IN ('g', 'ml') AND v_stock_unit != v_usage_unit THEN
                         -- Stock is 'un', 'cx', etc.
                         IF v_unit_weight > 0 THEN
                             v_qty_to_deduct := v_qty_to_deduct / v_unit_weight;
                         END IF;
                    END IF;
                ELSIF v_usage_unit = 'un' THEN
                    IF v_stock_unit IN ('kg', 'l') THEN
                         -- Convert Unit -> Grams -> KG
                         v_qty_to_deduct := (v_qty_to_deduct * v_unit_weight) / 1000.0;
                    ELSIF v_stock_unit IN ('g', 'ml') THEN
                         -- Convert Unit -> Grams
                         v_qty_to_deduct := v_qty_to_deduct * v_unit_weight;
                    END IF;
                ELSIF v_usage_unit IN ('kg', 'l') THEN
                     IF v_stock_unit IN ('g', 'ml') THEN
                         v_qty_to_deduct := v_qty_to_deduct * 1000.0;
                     END IF;
                END IF;

                -- DEDUCT DYNAMIC STOCK (INGREDIENT)
                -- Need to handle the partial index constraint
                -- Try UPDATE first, if 0 rows then INSERT
                UPDATE product_stocks 
                SET quantity = quantity - v_qty_to_deduct, last_updated = now()
                WHERE ingredient_id = r_ingredient.id AND location_id = p_location_id;
                
                IF NOT FOUND THEN
                    INSERT INTO product_stocks (ingredient_id, location_id, quantity, average_cost)
                    VALUES (r_ingredient.id, p_location_id, -v_qty_to_deduct, 0); -- Negative stock allowed? Assuming yes or 0.
                END IF;

                -- DEDUCT LEGACY STOCK (Sync)
                IF v_stock_source_slug = 'stock-danilo' THEN
                    UPDATE ingredients SET stock_danilo = stock_danilo - v_qty_to_deduct WHERE id = r_ingredient.id;
                ELSIF v_stock_source_slug = 'stock-adriel' THEN
                    UPDATE ingredients SET stock_adriel = stock_adriel - v_qty_to_deduct WHERE id = r_ingredient.id;
                END IF;

            END IF;

        ELSIF v_item_record.type = 'product' THEN
            SELECT * INTO r_product FROM products WHERE id = v_item_record.item_id;
            IF FOUND THEN
                v_item_cost := r_product.cost * (v_item_record.quantity_used + v_item_record.waste_quantity);
                
                -- Deduct Dynamic (PRODUCT)
                UPDATE product_stocks 
                SET quantity = quantity - (v_item_record.quantity_used + v_item_record.waste_quantity)
                WHERE product_id = r_product.id AND location_id = p_location_id;
                
                IF NOT FOUND THEN
                    INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
                    VALUES (r_product.id, p_location_id, -(v_item_record.quantity_used + v_item_record.waste_quantity), 0);
                END IF;

                -- Legacy Sync
                UPDATE products
                SET stock_quantity = stock_quantity - (v_item_record.quantity_used + v_item_record.waste_quantity)
                WHERE id = r_product.id;
                
                IF v_stock_source_slug = 'stock-danilo' THEN
                    UPDATE products SET stock_danilo = stock_danilo - (v_item_record.quantity_used + v_item_record.waste_quantity) WHERE id = r_product.id;
                END IF;

            END IF;
        END IF;
        
        v_total_cost := v_total_cost + COALESCE(v_item_cost, 0);
    END LOOP;

    -- Add Finished Product (PRODUCT)
    -- Dynamic
    -- Use UPSERT logic compatible with partial index
    -- Update existing or insert
    
    -- Check if exists
    IF EXISTS (SELECT 1 FROM product_stocks WHERE product_id = v_product_id AND location_id = p_location_id) THEN
        UPDATE product_stocks
        SET 
            average_cost = CASE WHEN quantity + p_actual_output_quantity > 0 
                               THEN ((average_cost * quantity) + v_total_cost) / (quantity + p_actual_output_quantity)
                               ELSE average_cost END,
            quantity = quantity + p_actual_output_quantity
        WHERE product_id = v_product_id AND location_id = p_location_id;
    ELSE
        INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
        VALUES (
            v_product_id, 
            p_location_id, 
            p_actual_output_quantity, 
            CASE WHEN p_actual_output_quantity > 0 THEN v_total_cost / p_actual_output_quantity ELSE 0 END
        );
    END IF;

    -- Legacy Sync
    UPDATE products
    SET 
        stock_quantity = stock_quantity + p_actual_output_quantity,
        cost = CASE WHEN p_actual_output_quantity > 0 THEN v_total_cost / p_actual_output_quantity ELSE cost END
    WHERE id = v_product_id;
    
    IF v_stock_source_slug = 'stock-danilo' THEN
        UPDATE products SET stock_danilo = stock_danilo + p_actual_output_quantity WHERE id = v_product_id;
    END IF;

    -- Close Order
    UPDATE production_orders
    SET 
        status = 'closed',
        closed_at = NOW(),
        actual_quantity = p_actual_output_quantity,
        cost_at_production = CASE WHEN p_actual_output_quantity > 0 THEN v_total_cost / p_actual_output_quantity ELSE 0 END,
        location_id = p_location_id
    WHERE id = p_order_id;
    
    -- Audit
    PERFORM audit_production_log('close_production', p_order_id, jsonb_build_object('output', p_actual_output_quantity, 'total_cost', v_total_cost, 'location', p_location_id), p_user_id);

    RETURN jsonb_build_object('success', true, 'new_cost', v_total_cost);
EXCEPTION WHEN OTHERS THEN
    RAISE; 
END;
$$;

-- 2. Update reopen_production_order
CREATE OR REPLACE FUNCTION reopen_production_order(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order record;
    v_item record;
    r_ingredient record;
    v_total_used numeric;
    v_qty_to_restore numeric;
    v_stock_unit text;
    v_usage_unit text;
    v_location_id uuid;
    v_stock_source_slug text;
BEGIN
    SELECT * INTO v_order FROM production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    v_location_id := v_order.location_id;
    
    -- Fallback location
    IF v_location_id IS NULL THEN
         SELECT id, slug INTO v_location_id, v_stock_source_slug FROM stock_locations WHERE slug = 'stock-danilo' LIMIT 1;
    ELSE
         SELECT slug INTO v_stock_source_slug FROM stock_locations WHERE id = v_location_id;
    END IF;

    IF v_order.status = 'closed' THEN
        -- Revert Ingredients (Add back)
        FOR v_item IN SELECT * FROM production_order_items WHERE order_id = p_order_id
        LOOP
            v_total_used := COALESCE(v_item.quantity_used, 0) + COALESCE(v_item.waste_quantity, 0);
            v_qty_to_restore := 0;
            
            IF v_total_used > 0 THEN
                IF v_item.type = 'ingredient' THEN
                    select * into r_ingredient from ingredients where id = v_item.item_id;
                    
                    if found then
                        -- Conversion
                        v_stock_unit := lower(r_ingredient.unit);
                        v_usage_unit := lower(v_item.unit);
                        v_qty_to_restore := v_total_used;
                        
                        -- Unified Conversion Logic
                        IF v_usage_unit IN ('g', 'ml') THEN
                            IF v_stock_unit IN ('kg', 'l') THEN
                                v_qty_to_restore := v_qty_to_restore / 1000.0;
                            ELSIF v_stock_unit NOT IN ('g', 'ml') AND v_stock_unit != v_usage_unit THEN
                                 -- Stock is 'un', 'cx', etc.
                                 IF r_ingredient.unit_weight > 0 THEN
                                     v_qty_to_restore := v_qty_to_restore / r_ingredient.unit_weight;
                                 END IF;
                            END IF;
                        ELSIF v_usage_unit = 'un' THEN
                            IF v_stock_unit IN ('kg', 'l') THEN
                                 -- Convert Unit -> Grams -> KG
                                 v_qty_to_restore := (v_qty_to_restore * r_ingredient.unit_weight) / 1000.0;
                            ELSIF v_stock_unit IN ('g', 'ml') THEN
                                 -- Convert Unit -> Grams
                                 v_qty_to_restore := v_qty_to_restore * r_ingredient.unit_weight;
                            END IF;
                        ELSIF v_usage_unit IN ('kg', 'l') THEN
                             IF v_stock_unit IN ('g', 'ml') THEN
                                 v_qty_to_restore := v_qty_to_restore * 1000.0;
                             END IF;
                        END IF;
                        
                        -- Revert Dynamic (INGREDIENT)
                        UPDATE product_stocks 
                        SET quantity = quantity + v_qty_to_restore 
                        WHERE ingredient_id = r_ingredient.id AND location_id = v_location_id;
                        -- If not found? Should exist if we deducted it.

                        -- Revert Legacy
                        IF v_stock_source_slug = 'stock-danilo' THEN
                             UPDATE ingredients SET stock_danilo = stock_danilo + v_qty_to_restore WHERE id = r_ingredient.id;
                        ELSIF v_stock_source_slug = 'stock-adriel' THEN
                             UPDATE ingredients SET stock_adriel = stock_adriel + v_qty_to_restore WHERE id = r_ingredient.id;
                        END IF;
                    end if;
                ELSIF v_item.type = 'product' THEN
                     -- Revert Dynamic (PRODUCT)
                     UPDATE product_stocks
                     SET quantity = quantity + v_total_used
                     WHERE product_id = v_item.item_id AND location_id = v_location_id;
                     
                     -- Revert Legacy
                     UPDATE products 
                     SET stock_quantity = stock_quantity + v_total_used 
                     WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- Revert Finished Product (Remove)
        IF v_order.quantity > 0 THEN
             -- Dynamic (PRODUCT)
             UPDATE product_stocks
             SET quantity = quantity - v_order.quantity
             WHERE product_id = v_order.product_id AND location_id = v_location_id;

             -- Legacy
             UPDATE products
             SET stock_quantity = stock_quantity - v_order.quantity
             WHERE id = v_order.product_id;
             
             IF v_stock_source_slug = 'stock-danilo' THEN
                 UPDATE products 
                 SET stock_danilo = stock_danilo - v_order.quantity 
                 WHERE id = v_order.product_id;
             END IF;
        END IF;
    END IF;

    -- Reset Order
    UPDATE production_orders
    SET 
        status = 'open',
        closed_at = NULL,
        cost_at_production = NULL,
        quantity = quantity,
        location_id = NULL
    WHERE id = p_order_id;
    
    UPDATE production_order_items
    SET quantity_used = quantity_planned, waste_quantity = 0
    WHERE order_id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order reopened for editing');
END;
$function$;

-- 3. Update delete_production_order_secure (same logic as reopen)
CREATE OR REPLACE FUNCTION delete_production_order_secure(p_order_id uuid, p_user_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order record;
    v_item record;
    r_ingredient record;
    v_total_used numeric;
    v_qty_to_restore numeric;
    v_stock_unit text;
    v_usage_unit text;
    v_location_id uuid;
    v_stock_source_slug text;
BEGIN
    SELECT * INTO v_order FROM production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    v_location_id := v_order.location_id;
    IF v_location_id IS NULL THEN
         SELECT id, slug INTO v_location_id, v_stock_source_slug FROM stock_locations WHERE slug = 'stock-danilo' LIMIT 1;
    ELSE
         SELECT slug INTO v_stock_source_slug FROM stock_locations WHERE id = v_location_id;
    END IF;

    IF v_order.status = 'closed' THEN
        FOR v_item IN SELECT * FROM production_order_items WHERE order_id = p_order_id
        LOOP
            v_total_used := COALESCE(v_item.quantity_used, 0) + COALESCE(v_item.waste_quantity, 0);
            v_qty_to_restore := 0;
            
            IF v_total_used > 0 THEN
                IF v_item.type = 'ingredient' THEN
                    select * into r_ingredient from ingredients where id = v_item.item_id;
                    if found then
                        v_stock_unit := lower(r_ingredient.unit);
                        v_usage_unit := lower(v_item.unit);
                        v_qty_to_restore := v_total_used;
                        -- Unified Conversion Logic
                        IF v_usage_unit IN ('g', 'ml') THEN
                            IF v_stock_unit IN ('kg', 'l') THEN
                                v_qty_to_restore := v_qty_to_restore / 1000.0;
                            ELSIF v_stock_unit NOT IN ('g', 'ml') AND v_stock_unit != v_usage_unit THEN
                                 -- Stock is 'un', 'cx', etc.
                                 IF r_ingredient.unit_weight > 0 THEN
                                     v_qty_to_restore := v_qty_to_restore / r_ingredient.unit_weight;
                                 END IF;
                            END IF;
                        ELSIF v_usage_unit = 'un' THEN
                            IF v_stock_unit IN ('kg', 'l') THEN
                                 -- Convert Unit -> Grams -> KG
                                 v_qty_to_restore := (v_qty_to_restore * r_ingredient.unit_weight) / 1000.0;
                            ELSIF v_stock_unit IN ('g', 'ml') THEN
                                 -- Convert Unit -> Grams
                                 v_qty_to_restore := v_qty_to_restore * r_ingredient.unit_weight;
                            END IF;
                        ELSIF v_usage_unit IN ('kg', 'l') THEN
                             IF v_stock_unit IN ('g', 'ml') THEN
                                 v_qty_to_restore := v_qty_to_restore * 1000.0;
                             END IF;
                        END IF;
                        
                        -- Dynamic (INGREDIENT)
                        UPDATE product_stocks SET quantity = quantity + v_qty_to_restore 
                        WHERE ingredient_id = r_ingredient.id AND location_id = v_location_id;

                        IF v_stock_source_slug = 'stock-danilo' THEN
                             UPDATE ingredients SET stock_danilo = stock_danilo + v_qty_to_restore WHERE id = r_ingredient.id;
                        ELSIF v_stock_source_slug = 'stock-adriel' THEN
                             UPDATE ingredients SET stock_adriel = stock_adriel + v_qty_to_restore WHERE id = r_ingredient.id;
                        END IF;
                    end if;
                ELSIF v_item.type = 'product' THEN
                     -- Dynamic (PRODUCT)
                     UPDATE product_stocks SET quantity = quantity + v_total_used
                     WHERE product_id = v_item.item_id AND location_id = v_location_id;
                     
                     UPDATE products SET stock_quantity = stock_quantity + v_total_used WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        IF v_order.quantity > 0 THEN
             -- Dynamic (PRODUCT)
             UPDATE product_stocks SET quantity = quantity - v_order.quantity
             WHERE product_id = v_order.product_id AND location_id = v_location_id;

             UPDATE products SET stock_quantity = stock_quantity - v_order.quantity WHERE id = v_order.product_id;
             IF v_stock_source_slug = 'stock-danilo' THEN
                 UPDATE products SET stock_danilo = stock_danilo - v_order.quantity WHERE id = v_order.product_id;
             END IF;
        END IF;
    END IF;

    DELETE FROM production_order_items WHERE order_id = p_order_id;
    DELETE FROM production_orders WHERE id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order deleted and stock reverted');
END;
$function$;
