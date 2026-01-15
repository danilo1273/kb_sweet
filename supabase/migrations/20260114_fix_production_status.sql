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
    r_product_intermediate record; -- To handle intermediate products if any
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
               -- A. Cost Calculation
               -- Calculate cost per base unit (e.g. per gram)
               if r_ingredient.unit_weight > 0 then
                   v_cost_ratio := r_ingredient.cost / r_ingredient.unit_weight;
               else 
                   v_cost_ratio := r_ingredient.cost; 
               end if;
               
               v_total_cost := v_total_cost + (v_cost_ratio * v_item.quantity_used);
               
               -- B. Stock Deduction Logic (Fixing the bug)
               v_stock_unit := lower(r_ingredient.unit);
               v_usage_unit := lower(v_item.unit);
               
               -- Default: Direct deduction
               v_qty_to_deduct := v_item.quantity_used;

               -- Conversion Logic
               if (v_stock_unit = 'un' or v_stock_unit = 'saco' or v_stock_unit = 'cx') and (v_usage_unit = 'g' or v_usage_unit = 'ml') then
                   if r_ingredient.unit_weight > 0 then
                       v_qty_to_deduct := v_item.quantity_used / r_ingredient.unit_weight;
                   end if;
               elsif (v_stock_unit = 'kg' and v_usage_unit = 'g') or (v_stock_unit = 'l' and v_usage_unit = 'ml') then
                    v_qty_to_deduct := v_item.quantity_used / 1000;
               elsif (v_stock_unit = 'g' and v_usage_unit = 'kg') or (v_stock_unit = 'ml' and v_usage_unit = 'l') then
                    v_qty_to_deduct := v_item.quantity_used * 1000;
               end if;
               
               -- Deduct Stock (Always from stock_danilo for now as per original logic)
               update ingredients 
               set stock_danilo = stock_danilo - v_qty_to_deduct 
               where id = v_item.item_id;
            else
                raise notice 'Item % not found in ingredients table', v_item.item_id;
            end if;

        -- Handle Intermediate Products (if needed in future, currently logic was missing or simple)
        -- Assuming similar logic if we were deducting products. 
        -- For now, preserving original behavior which seemed to ignore products or assume ingredients table only?
        -- The original code did: select * into r_ingredient from ingredients where id = v_item.item_id;
        -- which would FAIL for type='product'.
        -- Let's try to handle type='product' too if it exists.
        elsif v_item.type = 'product' then
             select * into r_product_intermediate from products where id = v_item.item_id;
             if found then
                -- Simplified cost for product (cost is per unit usually)
                v_total_cost := v_total_cost + (r_product_intermediate.cost * v_item.quantity_used);
                
                -- Deduct from product stock
                update products
                set stock_quantity = stock_quantity - v_item.quantity_used -- Assuming same unit for products vs products
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
            cost = v_unit_cost
        where id = v_product_id;
    elsif p_target_stock = 'adriel' then
         update products 
        set stock_adriel = coalesce(stock_adriel, 0) + p_actual_output_quantity,
            cost = v_unit_cost
        where id = v_product_id;
    else
        update products 
        set stock_quantity = coalesce(stock_quantity, 0) + p_actual_output_quantity,
            cost = v_unit_cost
        where id = v_product_id;
    end if;

end;
$function$
