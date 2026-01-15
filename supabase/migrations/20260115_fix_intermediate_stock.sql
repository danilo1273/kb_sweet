-- Migration to fix Intermediate Product Stock Logic
-- Ensures that when an intermediate product (base/filling) is used in a production order,
-- it deducts from 'stock_danilo' (available stock) in addition to 'stock_quantity' (total stock).
-- Also applies consistent logic for reversion (delete/reopen).

CREATE OR REPLACE FUNCTION public.close_production_order(p_order_id uuid, p_actual_output_quantity numeric, p_target_stock text DEFAULT 'danilo'::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
declare
    v_total_cost numeric := 0;
    v_unit_cost numeric := 0;
    v_product_id uuid;
    v_item record;
    r_ingredient record;
    r_product_intermediate record;
    v_cost_ratio numeric;
    v_qty_to_deduct numeric;
    v_stock_unit text;
    v_usage_unit text;
begin
    -- 1. Get Order Details
    select product_id into v_product_id from production_orders where id = p_order_id;
    
    if v_product_id is null then
        raise exception 'Order not found';
    end if;

    -- 2. Calculate Total Cost based on actual usage AND Deduct Stock
    for v_item in 
        select * from production_order_items where order_id = p_order_id
    loop
        v_qty_to_deduct := 0;
        
        -- Handle Ingredients
        if v_item.type = 'ingredient' then
            select * into r_ingredient from ingredients where id = v_item.item_id;
            
            if found then
               -- Cost Calculation
               if r_ingredient.unit_weight > 0 then
                   v_cost_ratio := r_ingredient.cost / r_ingredient.unit_weight;
               else 
                   v_cost_ratio := r_ingredient.cost; 
               end if;
               
               v_total_cost := v_total_cost + (v_cost_ratio * v_item.quantity_used);
               
               -- Stock Deduction Logic
               v_stock_unit := lower(r_ingredient.unit);
               v_usage_unit := lower(v_item.unit);
               
               v_qty_to_deduct := v_item.quantity_used;

               -- Conversion
               if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                   if r_ingredient.unit_weight > 0 then
                       v_qty_to_deduct := v_item.quantity_used / r_ingredient.unit_weight;
                   end if;
               elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                    v_qty_to_deduct := v_item.quantity_used / 1000;
               elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                    v_qty_to_deduct := v_item.quantity_used * 1000;
               end if;
               
               update ingredients 
               set stock_danilo = stock_danilo - v_qty_to_deduct 
               where id = v_item.item_id;
            end if;

        -- Handle Intermediate Products
        elsif v_item.type = 'product' then
             select * into r_product_intermediate from products where id = v_item.item_id;
             if found then
                -- Cost Calculation
                -- For products, cost is stored as Unit Cost now (after recent fix).
                -- So we multiply Unit Cost * Quantity Used.
                -- Note: Checks if units match (e.g. g to g). 
                -- If the product is stored in 'g' and used in 'g', direct multiplication.
                -- If stored in 'un' (e.g. 1 cake) and used in 'g', this might be tricky, 
                -- but usually intermediate products like 'Recheio' are stored in 'g' and used in 'g'.
                
                v_total_cost := v_total_cost + (COALESCE(r_product_intermediate.cost, 0) * v_item.quantity_used);
                
                -- Deduct from product stock
                -- FIX: Deduct from stock_danilo AS WELL
                -- Assuming 'stock_quantity' acts as total and 'stock_danilo' as specific location/available.
                update products
                set stock_quantity = stock_quantity - v_item.quantity_used,
                    stock_danilo = coalesce(stock_danilo, 0) - v_item.quantity_used
                where id = v_item.item_id;
             end if;
        end if;

    end loop;

    -- 3. Calculate Unit Cost
    if p_actual_output_quantity > 0 then
        v_unit_cost := v_total_cost / p_actual_output_quantity;
    else
        v_unit_cost := 0;
    end if;

    -- 4. Update Production Order
    update production_orders 
    set status = 'closed',
        actual_quantity = p_actual_output_quantity,
        cost_at_production = v_unit_cost,
        closed_at = now()
    where id = p_order_id;

    -- 5. Update Product Stock (Add finished good)
    if p_target_stock = 'danilo' then
        update products 
        set stock_danilo = coalesce(stock_danilo, 0) + p_actual_output_quantity,
            cost = v_unit_cost -- Update latest cost
        where id = v_product_id;
    elsif p_target_stock = 'adriel' then
         update products 
        set stock_adriel = coalesce(stock_adriel, 0) + p_actual_output_quantity,
            cost = v_unit_cost
        where id = v_product_id;
    else
        -- Fallback
        update products 
        set stock_quantity = coalesce(stock_quantity, 0) + p_actual_output_quantity,
            stock_danilo = coalesce(stock_danilo, 0) + p_actual_output_quantity, -- Default to Danilo if not specified
            cost = v_unit_cost
        where id = v_product_id;
    end if;

end;
$function$;

CREATE OR REPLACE FUNCTION public.delete_production_order(p_order_id uuid)
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
    v_qty_to_revert numeric; 
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
                        
                        UPDATE ingredients 
                        SET stock_danilo = stock_danilo + v_qty_to_restore 
                        WHERE id = v_item.item_id;
                    end if;

                ELSIF v_item.type = 'product' THEN
                    -- Simple restoration for products
                    -- FIX: Restore to stock_danilo as well
                     UPDATE products 
                     SET stock_quantity = stock_quantity + v_total_used,
                         stock_danilo = coalesce(stock_danilo, 0) + v_total_used
                     WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- 2. Revert Finished Product (Remove from stock)
        v_qty_to_revert := COALESCE(v_order.actual_quantity, v_order.quantity);
        
        IF v_qty_to_revert > 0 THEN
             UPDATE products
             SET stock_danilo = CASE WHEN stock_danilo >= v_qty_to_revert THEN stock_danilo - v_qty_to_revert ELSE stock_danilo END,
                 stock_quantity = stock_quantity - v_qty_to_revert
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
    v_qty_to_revert numeric; 
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
                        UPDATE ingredients 
                        SET stock_danilo = stock_danilo + v_qty_to_restore 
                        WHERE id = v_item.item_id;
                    end if;
                    
                ELSIF v_item.type = 'product' THEN
                    -- FIX: Restore to stock_danilo
                    UPDATE products 
                    SET stock_quantity = stock_quantity + v_total_used,
                        stock_danilo = coalesce(stock_danilo, 0) + v_total_used
                    WHERE id = v_item.item_id;
                END IF;
            END IF;
        END LOOP;

        -- 2. Revert Finished Product
        v_qty_to_revert := COALESCE(v_order.actual_quantity, v_order.quantity);
        IF v_qty_to_revert > 0 THEN
             UPDATE products
             SET stock_danilo = CASE WHEN stock_danilo >= v_qty_to_revert THEN stock_danilo - v_qty_to_revert ELSE stock_danilo END,
                 stock_quantity = stock_quantity - v_qty_to_revert
             WHERE id = v_order.product_id;
        END IF;

    END IF;

    -- 3. Reset Order Status
    UPDATE production_orders
    SET 
        status = 'open',
        closed_at = NULL,
        cost_at_production = NULL,
        quantity = quantity,
        actual_quantity = NULL
    WHERE id = p_order_id;
    
    UPDATE production_order_items
    SET 
        quantity_used = quantity_planned, 
        waste_quantity = 0
    WHERE order_id = p_order_id;

    RETURN json_build_object('success', true, 'message', 'Order reopened for editing');
END;
$function$;
