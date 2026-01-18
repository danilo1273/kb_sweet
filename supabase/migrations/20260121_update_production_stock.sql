-- 1. Add location_id to production_orders
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'production_orders' AND column_name = 'location_id') THEN
        ALTER TABLE production_orders ADD COLUMN location_id UUID REFERENCES stock_locations(id);
    END IF;
END $$;

-- 2. Update close_production_order_secure RPC
-- Drop old signatures first
DROP FUNCTION IF EXISTS close_production_order_secure(uuid, jsonb, numeric, text, uuid);
DROP FUNCTION IF EXISTS reopen_production_order(uuid);
DROP FUNCTION IF EXISTS delete_production_order_secure(uuid, uuid);

CREATE OR REPLACE FUNCTION close_production_order_secure(
    p_order_id UUID,
    p_items_usage JSONB,
    p_actual_output_quantity NUMERIC,
    p_location_id UUID, -- Changed from p_target_stock text
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
    v_current_stock NUMERIC;
    v_new_stock NUMERIC;
BEGIN
    -- Validation
    SELECT product_id, quantity INTO v_product_id, v_order_qty
    FROM production_orders 
    WHERE id = p_order_id AND status = 'open';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordem de produção inválida ou já fechada.';
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
                    -- Check average_cost in product_stocks first? 
                    -- For now keep legacy fallback or check product_stocks
                     SELECT average_cost INTO v_base_cost FROM product_stocks WHERE product_id = r_ingredient.id AND location_id = p_location_id;
                     IF v_base_cost IS NULL OR v_base_cost = 0 THEN
                        v_base_cost := GREATEST(COALESCE(r_ingredient.cost_danilo, 0), COALESCE(r_ingredient.cost_adriel, 0));
                     END IF;
                END IF;
                
                -- Calculate Cost
                IF v_unit_weight > 0 THEN
                     v_item_cost := (v_base_cost / v_unit_weight) * (v_item_record.quantity_used + v_item_record.waste_quantity);
                ELSE
                     v_item_cost := v_base_cost * (v_item_record.quantity_used + v_item_record.waste_quantity);
                END IF;

                -- Stock Logic
                v_qty_to_deduct := v_item_record.quantity_used + v_item_record.waste_quantity;

                -- Generic Conversion Logic
                IF (v_usage_unit IN ('g', 'ml')) AND (v_stock_unit NOT IN ('kg', 'l', 'g', 'ml')) THEN
                    IF v_unit_weight > 0 THEN
                        v_qty_to_deduct := v_qty_to_deduct / v_unit_weight;
                    END IF;
                ELSIF (v_stock_unit IN ('kg', 'l')) AND (v_usage_unit IN ('g', 'ml')) THEN
                    v_qty_to_deduct := v_qty_to_deduct / 1000.0;
                ELSIF (v_stock_unit IN ('g', 'ml')) AND (v_usage_unit IN ('kg', 'l')) THEN
                    v_qty_to_deduct := v_qty_to_deduct * 1000.0;
                END IF;

                -- DEDUCT DYNAMIC STOCK
                -- Ensure row exists
                INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
                VALUES (r_ingredient.id, p_location_id, 0, 0)
                ON CONFLICT DO NOTHING;

                UPDATE product_stocks 
                SET quantity = quantity - v_qty_to_deduct, last_updated = now()
                WHERE product_id = r_ingredient.id AND location_id = p_location_id;

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
                
                -- Deduct Dynamic
                INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
                VALUES (r_product.id, p_location_id, 0, 0)
                ON CONFLICT DO NOTHING;

                UPDATE product_stocks
                SET quantity = quantity - (v_item_record.quantity_used + v_item_record.waste_quantity)
                WHERE product_id = r_product.id AND location_id = p_location_id;

                -- Legacy Sync
                UPDATE products
                SET stock_quantity = stock_quantity - (v_item_record.quantity_used + v_item_record.waste_quantity)
                WHERE id = r_product.id;

                IF v_stock_source_slug = 'stock-danilo' THEN
                    UPDATE products SET stock_danilo = stock_danilo - (v_item_record.quantity_used + v_item_record.waste_quantity) WHERE id = r_product.id;
                ELSIF v_stock_source_slug = 'stock-adriel' THEN
                     -- Assuming stock_adriel exists on products? Usually only stock_danilo was used for simple products or just stock_quantity.
                     -- Use generic stock_quantity if specific column missing, but products table usually has stock_danilo/adriel?
                     -- Let's stick to updating stock_quantity global for products type.
                     NULL;
                END IF;

            END IF;
        END IF;
        
        v_total_cost := v_total_cost + COALESCE(v_item_cost, 0);
    END LOOP;

    -- Add Finished Product
    -- Dynamic
    INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
    VALUES (v_product_id, p_location_id, 0, 0)
    ON CONFLICT (product_id, location_id) DO UPDATE 
    SET average_cost = CASE WHEN EXCLUDED.quantity + p_actual_output_quantity > 0 
                       THEN ((product_stocks.average_cost * product_stocks.quantity) + v_total_cost) / (product_stocks.quantity + p_actual_output_quantity)
                       ELSE product_stocks.average_cost END;
    
    UPDATE product_stocks
    SET quantity = quantity + p_actual_output_quantity
    WHERE product_id = v_product_id AND location_id = p_location_id;

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
        location_id = p_location_id -- Save location!
    WHERE id = p_order_id;
    
    PERFORM audit_production_log('close_production', p_order_id, jsonb_build_object('output', p_actual_output_quantity, 'total_cost', v_total_cost, 'location', p_location_id), p_user_id);

    RETURN jsonb_build_object('success', true, 'new_cost', v_total_cost);
END;
$$;

-- 3. Update reopen_production_order
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
    
    -- If location_id is null (legacy order), try to default to Danilo?
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
                        -- Conversion Logic
                        v_stock_unit := lower(r_ingredient.unit);
                        v_usage_unit := lower(v_item.unit);
                        v_qty_to_restore := v_total_used;
                        
                        if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                           if r_ingredient.unit_weight > 0 then
                               v_qty_to_restore := v_total_used / r_ingredient.unit_weight;
                           end if;
                        elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                            v_qty_to_restore := v_total_used / 1000;
                        elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                            v_qty_to_restore := v_total_used * 1000;
                        end if;
                        
                        -- Revert Dynamic
                        UPDATE product_stocks 
                        SET quantity = quantity + v_qty_to_restore 
                        WHERE product_id = r_ingredient.id AND location_id = v_location_id;

                        -- Revert Legacy
                        IF v_stock_source_slug = 'stock-danilo' THEN
                             UPDATE ingredients SET stock_danilo = stock_danilo + v_qty_to_restore WHERE id = r_ingredient.id;
                        ELSIF v_stock_source_slug = 'stock-adriel' THEN
                             UPDATE ingredients SET stock_adriel = stock_adriel + v_qty_to_restore WHERE id = r_ingredient.id;
                        END IF;
                    end if;
                ELSIF v_item.type = 'product' THEN
                     -- Revert Dynamic
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
             -- Dynamic
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
        location_id = NULL -- Clear location on reopen? Yes, or keep it.
    WHERE id = p_order_id;
    
    UPDATE production_order_items
    SET quantity_used = quantity_planned, waste_quantity = 0
    WHERE order_id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order reopened for editing');
END;
$function$;

-- 4. Update delete_production_order (using same reopen logic basically)
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
        -- Revert Ingredients
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
                        if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                           if r_ingredient.unit_weight > 0 then v_qty_to_restore := v_total_used / r_ingredient.unit_weight; end if;
                        elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                            v_qty_to_restore := v_total_used / 1000;
                        elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                            v_qty_to_restore := v_total_used * 1000;
                        end if;
                        
                        UPDATE product_stocks SET quantity = quantity + v_qty_to_restore 
                        WHERE product_id = r_ingredient.id AND location_id = v_location_id;

                        IF v_stock_source_slug = 'stock-danilo' THEN
                             UPDATE ingredients SET stock_danilo = stock_danilo + v_qty_to_restore WHERE id = r_ingredient.id;
                        ELSIF v_stock_source_slug = 'stock-adriel' THEN
                             UPDATE ingredients SET stock_adriel = stock_adriel + v_qty_to_restore WHERE id = r_ingredient.id;
                        END IF;
                    end if;
                ELSIF v_item.type = 'product' THEN
                     UPDATE product_stocks SET quantity = quantity + v_total_used
                     WHERE product_id = v_item.item_id AND location_id = v_location_id;
                     UPDATE products SET stock_quantity = stock_quantity + v_total_used WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- Revert Product
        IF v_order.quantity > 0 THEN
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
