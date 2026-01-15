-- Migration to fix unit conversion in delete and reopen production order RPCs
-- Ensures stock is restored correctly to the storage unit

CREATE OR REPLACE FUNCTION public.delete_production_order(p_order_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
    v_order record;
    v_item record;
    r_ingredient record;
    r_product_intermediate record;
    v_total_used numeric;
    v_qty_to_restore numeric;
    v_stock_unit text;
    v_usage_unit text;
BEGIN
    SELECT * INTO v_order FROM production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- If Closed, Revert Stock
    IF v_order.status = 'closed' THEN
        -- 1. Revert Ingredients/Intermediates (Add back to stock)
        FOR v_item IN SELECT * FROM production_order_items WHERE order_id = p_order_id
        LOOP
            v_total_used := COALESCE(v_item.quantity_used, 0) + COALESCE(v_item.waste_quantity, 0);
            v_qty_to_restore := 0;
            
            IF v_total_used > 0 THEN
                IF v_item.type = 'ingredient' THEN
                    select * into r_ingredient from ingredients where id = v_item.item_id;
                    
                    if found then
                        -- Conversion Logic (Identical to close_production_order but for restoring)
                        v_stock_unit := lower(r_ingredient.unit);
                        v_usage_unit := lower(v_item.unit);
                        
                        -- Default: Direct restoration
                        v_qty_to_restore := v_total_used;
                        
                        -- Conversion
                        if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                           if r_ingredient.unit_weight > 0 then
                               v_qty_to_restore := v_total_used / r_ingredient.unit_weight;
                           end if;
                        elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                            v_qty_to_restore := v_total_used / 1000;
                        elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                            v_qty_to_restore := v_total_used * 1000;
                        end if;
                        
                        UPDATE ingredients 
                        SET stock_danilo = stock_danilo + v_qty_to_restore 
                        WHERE id = v_item.item_id;
                    end if;

                ELSIF v_item.type = 'product' THEN
                    -- Simple restoration for products
                     UPDATE products 
                     SET stock_quantity = stock_quantity + v_total_used 
                     WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- 2. Revert Finished Product (Remove from stock)
        IF v_order.quantity > 0 THEN
             -- Determine which stock to deduct from based on where it was added?
             -- Logic in close_production_order defaults to 'danilo' or checks a param not stored on order.
             -- Assuming 'danilo' for safety or checking if we can infer.
             -- Current implementation subtracts from generic stock_quantity or specific columns.
             -- To be safe and consistent with previous close logic (which added to stock_danilo if parameter was danilo),
             -- we should ideally deduct from where it was added. But we don't store "target_stock" in production_orders table.
             -- We will subtract from stock_danilo if it exists, or stock_quantity.
             
             UPDATE products
             SET stock_danilo = CASE WHEN stock_danilo >= v_order.quantity THEN stock_danilo - v_order.quantity ELSE stock_danilo END,
                 stock_quantity = stock_quantity - v_order.quantity -- Keep generic sync
             WHERE id = v_order.product_id;
        END IF;

    END IF;

    -- 3. Delete Order and Items
    DELETE FROM production_order_items WHERE order_id = p_order_id;
    DELETE FROM production_orders WHERE id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order deleted and stock reverted');
END;
$function$;

CREATE OR REPLACE FUNCTION public.reopen_production_order(p_order_id uuid)
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
BEGIN
    SELECT * INTO v_order FROM production_orders WHERE id = p_order_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order not found';
    END IF;

    -- If Closed, Revert Stock
    IF v_order.status = 'closed' THEN
        -- 1. Revert Ingredients/Intermediates (Add back to stock)
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
                        
                        -- Default: Direct restoration
                        v_qty_to_restore := v_total_used;
                        
                        -- Conversion
                        if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                           if r_ingredient.unit_weight > 0 then
                               v_qty_to_restore := v_total_used / r_ingredient.unit_weight;
                           end if;
                        elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                            v_qty_to_restore := v_total_used / 1000;
                        elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                            v_qty_to_restore := v_total_used * 1000;
                        end if;
                        
                        UPDATE ingredients 
                        SET stock_danilo = stock_danilo + v_qty_to_restore 
                        WHERE id = v_item.item_id;
                    end if;
                    
                ELSIF v_item.type = 'product' THEN
                    UPDATE products 
                    SET stock_quantity = stock_quantity + v_total_used 
                    WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- 2. Revert Finished Product (Remove from stock)
        IF v_order.quantity > 0 THEN
             UPDATE products
             SET stock_danilo = CASE WHEN stock_danilo >= v_order.quantity THEN stock_danilo - v_order.quantity ELSE stock_danilo END,
                 stock_quantity = stock_quantity - v_order.quantity
             WHERE id = v_order.product_id;
        END IF;

    END IF;

    -- 3. Reset Order Status
    UPDATE production_orders
    SET 
        status = 'open',
        closed_at = NULL,
        cost_at_production = NULL,
        quantity = quantity 
    WHERE id = p_order_id;
    
    -- Reset Items used quantities to planned
    UPDATE production_order_items
    SET 
        quantity_used = quantity_planned, 
        waste_quantity = 0
    WHERE order_id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order reopened for editing');
END;
$function$;
