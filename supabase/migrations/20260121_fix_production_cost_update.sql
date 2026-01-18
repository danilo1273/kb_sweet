-- Fix Production Closing to update legacy cost columns (cost_danilo/cost_adriel)

CREATE OR REPLACE FUNCTION close_production_order_secure(
    p_order_id UUID,
    p_items_usage JSONB, -- Array of {id: uuid, quantity_used: number, waste_quantity: number}
    p_actual_output_quantity NUMERIC,
    p_target_stock TEXT, -- 'danilo' or 'adriel'
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
    
    v_new_unit_cost NUMERIC;
    v_current_stock NUMERIC;
    v_current_total_value NUMERIC;
BEGIN
    -- A. Validate Order
    SELECT product_id, quantity INTO v_product_id, v_order_qty
    FROM production_orders 
    WHERE id = p_order_id AND status = 'open';
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordem de produção inválida ou já fechada.';
    END IF;

    -- B. Update Item Usages
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

    -- C. Deduct Stock & Calculate Batch Cost
    FOR v_item_record IN SELECT * FROM production_order_items WHERE order_id = p_order_id
    LOOP
        v_qty_to_deduct := 0;
        v_item_cost := 0;
        
        -- C1. Handle Ingredients
        IF v_item_record.type = 'ingredient' THEN
            SELECT * INTO r_ingredient FROM ingredients WHERE id = v_item_record.item_id;
            
            IF FOUND THEN
                v_stock_unit := lower(r_ingredient.unit);
                v_usage_unit := lower(v_item_record.unit);
                v_unit_weight := COALESCE(r_ingredient.unit_weight, 1);
                
                -- Fallback Cost Logic
                v_base_cost := r_ingredient.cost;
                IF v_base_cost IS NULL OR v_base_cost = 0 THEN
                    v_base_cost := GREATEST(COALESCE(r_ingredient.cost_danilo, 0), COALESCE(r_ingredient.cost_adriel, 0));
                END IF;
                
                -- Calculate Cost
                IF v_unit_weight > 0 THEN
                     v_item_cost := (v_base_cost / v_unit_weight) * (v_item_record.quantity_used + v_item_record.waste_quantity);
                ELSE
                     v_item_cost := v_base_cost * (v_item_record.quantity_used + v_item_record.waste_quantity);
                END IF;

                -- Stock Logic
                v_qty_to_deduct := v_item_record.quantity_used + v_item_record.waste_quantity;

                -- Conversion Logic
                IF (v_usage_unit IN ('g', 'ml')) AND (v_stock_unit NOT IN ('kg', 'l', 'g', 'ml')) THEN
                    IF v_unit_weight > 0 THEN
                        v_qty_to_deduct := v_qty_to_deduct / v_unit_weight;
                    END IF;
                ELSIF (v_stock_unit IN ('kg', 'l')) AND (v_usage_unit IN ('g', 'ml')) THEN
                    v_qty_to_deduct := v_qty_to_deduct / 1000.0;
                ELSIF (v_stock_unit IN ('g', 'ml')) AND (v_usage_unit IN ('kg', 'l')) THEN
                    v_qty_to_deduct := v_qty_to_deduct * 1000.0;
                END IF;

                -- Update Ingredient Stock (Legacy Target)
                IF p_target_stock = 'danilo' THEN
                     UPDATE ingredients SET stock_danilo = stock_danilo - v_qty_to_deduct WHERE id = r_ingredient.id;
                ELSE 
                     UPDATE ingredients SET stock_adriel = stock_adriel - v_qty_to_deduct WHERE id = r_ingredient.id;
                END IF;
            END IF;

        -- C2. Handle Products
        ELSIF v_item_record.type = 'product' THEN
            SELECT * INTO r_product FROM products WHERE id = v_item_record.item_id;
            IF FOUND THEN
                v_item_cost := r_product.cost * (v_item_record.quantity_used + v_item_record.waste_quantity);
                
                -- Update Product Stock (Legacy Target)
                IF p_target_stock = 'danilo' THEN
                    UPDATE products SET stock_danilo = stock_danilo - (v_item_record.quantity_used + v_item_record.waste_quantity) WHERE id = r_product.id;
                ELSE
                    UPDATE products SET stock_adriel = stock_adriel - (v_item_record.quantity_used + v_item_record.waste_quantity) WHERE id = r_product.id;
                END IF;
                
                -- Also update main quantity if needed (usually matches one of them)
                UPDATE products SET stock_quantity = stock_quantity - (v_item_record.quantity_used + v_item_record.waste_quantity) WHERE id = r_product.id;
            END IF;
        END IF;
        
        v_total_cost := v_total_cost + COALESCE(v_item_cost, 0);
    END LOOP;

    -- D. Calculate New Unit Cost (Weighted Average or Replacement)
    -- Logic: Replacement Cost (Last Production Cost) seems preferred by user expectation, 
    -- BUT normally Weighted Average is better. 
    -- Given the user complaint, they likely expect the produced batch price to be the new price if previous stock was low/zero.
    -- Let's stick to Replacement Cost for the 'cost' field, but maybe Weighted Average could be implemented later.
    -- Correction: For now, strictly use Batch Cost as the new Product Cost to match user expectation.
    
    IF p_actual_output_quantity > 0 THEN
        v_new_unit_cost := v_total_cost / p_actual_output_quantity;
    ELSE
        -- If no output, don't change cost? Or set to 0?
        -- Retrieve old cost
        SELECT cost INTO v_new_unit_cost FROM products WHERE id = v_product_id;
    END IF;

    -- E. Add Finished Product & Update Costs
    UPDATE products
    SET 
        stock_quantity = stock_quantity + p_actual_output_quantity,
        cost = v_new_unit_cost, -- Update Main Cost
        
        -- Update Legacy Stock Columns
        stock_danilo = CASE WHEN p_target_stock = 'danilo' THEN stock_danilo + p_actual_output_quantity ELSE stock_danilo END,
        stock_adriel = CASE WHEN p_target_stock = 'adriel' THEN stock_adriel + p_actual_output_quantity ELSE stock_adriel END,
        
        -- Update Legacy Cost Columns (CRITICAL FIX)
        -- We update the cost specific to the location where production occurred
        cost_danilo = CASE WHEN p_target_stock = 'danilo' THEN v_new_unit_cost ELSE cost_danilo END,
        cost_adriel = CASE WHEN p_target_stock = 'adriel' THEN v_new_unit_cost ELSE cost_adriel END
        
    WHERE id = v_product_id;

    -- F. Close Order
    UPDATE production_orders
    SET 
        status = 'closed',
        closed_at = NOW(),
        actual_quantity = p_actual_output_quantity,
        cost_at_production = v_new_unit_cost
    WHERE id = p_order_id;
    
    IF NOT FOUND THEN
         RAISE EXCEPTION 'Erro Crítico: Falha ao fechar ordem de produção.';
    END IF;
    
    -- Audit
    PERFORM audit_production_log('close_production', p_order_id, jsonb_build_object('output', p_actual_output_quantity, 'total_cost', v_total_cost, 'unit_cost', v_new_unit_cost), p_user_id);

    RETURN jsonb_build_object('success', true, 'new_cost', v_new_unit_cost);
END;
$$;
