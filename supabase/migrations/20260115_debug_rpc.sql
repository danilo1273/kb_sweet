CREATE OR REPLACE FUNCTION approve_purchase_item(
    p_request_id UUID,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    v_req record;
    v_ing record;
    v_factor numeric := 1;
    v_converted_qty numeric;
    v_new_owner_stock numeric;
    v_current_owner_cost numeric;
    v_new_owner_avg numeric;
    v_total_stock numeric;
    v_new_global_avg numeric;
    v_target_stock_col text;
    v_target_cost_col text;
BEGIN
    -- Fetch Request
    SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de pedido não encontrado'; END IF;
    
    IF v_req.status = 'approved' THEN RAISE EXCEPTION 'Item já está aprovado'; END IF;

    -- Fetch Ingredient (if linked)
    -- Logic to match by name if ID is missing (similar to frontend)
    IF v_req.ingredient_id IS NULL THEN
        SELECT * INTO v_ing FROM ingredients 
        WHERE normalize_text(name) = normalize_text(v_req.item_name)
        LIMIT 1;
        
        -- DEBUG: If we found it, let's link it PERMANENTLY so we know we found it
        IF v_ing IS NOT NULL THEN
            UPDATE purchase_requests SET ingredient_id = v_ing.id WHERE id = p_request_id;
        END IF;
    ELSE
        SELECT * INTO v_ing FROM ingredients WHERE id = v_req.ingredient_id;
    END IF;

    -- Update Logic (Only if mapped to an ingredient)
    IF v_ing IS NOT NULL AND v_ing.type <> 'expense' THEN
        -- Calculate Factor
        IF normalize_text(v_req.unit) = normalize_text(v_ing.unit) THEN
            v_factor := 1;
        ELSIF normalize_text(v_req.unit) = normalize_text(COALESCE(v_ing.unit_type, '')) THEN
            v_factor := COALESCE(v_ing.unit_weight, 1);
        ELSIF normalize_text(v_req.unit) = normalize_text(COALESCE(v_ing.purchase_unit, '')) THEN
            v_factor := COALESCE(v_ing.purchase_unit_factor, 1);
        ELSE
            v_factor := 1; 
        END IF;

        v_converted_qty := v_req.quantity * v_factor;

        -- Determine Target Columns
        IF v_req.destination = 'adriel' THEN
            v_target_stock_col := 'stock_adriel';
            v_target_cost_col := 'cost_adriel';
            v_current_owner_cost := COALESCE(v_ing.cost_adriel, 0);
            v_new_owner_stock := COALESCE(v_ing.stock_adriel, 0) + v_converted_qty;
        ELSE
            v_target_stock_col := 'stock_danilo';
            v_target_cost_col := 'cost_danilo';
            v_current_owner_cost := COALESCE(v_ing.cost_danilo, 0);
            v_new_owner_stock := COALESCE(v_ing.stock_danilo, 0) + v_converted_qty;
        END IF;

        -- Calculate Weighted Averages (Owner)
        IF v_new_owner_stock > 0 THEN
             IF v_req.destination = 'adriel' THEN
                 v_new_owner_avg := ((COALESCE(v_ing.stock_adriel, 0) * v_current_owner_cost) + v_req.cost) / v_new_owner_stock;
             ELSE
                 v_new_owner_avg := ((COALESCE(v_ing.stock_danilo, 0) * v_current_owner_cost) + v_req.cost) / v_new_owner_stock;
             END IF;
        ELSE
             v_new_owner_avg := v_current_owner_cost;
        END IF;

        -- Calculate Global Weighted Average
        v_total_stock := COALESCE(v_ing.stock_danilo, 0) + COALESCE(v_ing.stock_adriel, 0) + v_converted_qty;
        IF v_total_stock > 0 THEN
            v_new_global_avg := (((COALESCE(v_ing.stock_danilo, 0) + COALESCE(v_ing.stock_adriel, 0)) * COALESCE(v_ing.cost, 0)) + v_req.cost) / v_total_stock;
        ELSE
            v_new_global_avg := COALESCE(v_ing.cost, 0);
        END IF;

        -- Update Ingredient
        IF v_req.destination = 'adriel' THEN
            UPDATE ingredients SET 
                stock_adriel = v_new_owner_stock,
                cost_adriel = v_new_owner_avg,
                cost = v_new_global_avg
            WHERE id = v_ing.id;
        ELSE
            UPDATE ingredients SET 
                stock_danilo = v_new_owner_stock,
                cost_danilo = v_new_owner_avg,
                cost = v_new_global_avg
            WHERE id = v_ing.id;
        END IF;
        
    ELSE
       -- WARNING: If no ingredient is found, we should probably warn or ensure it's an expense.
       -- For now, if it's not found, we do nothing regarding stock, just financial.
       -- BUT I will raise a notice to logs if possible.
       RAISE NOTICE 'Skipping stock update: Ingredient not found or is expense. Name: %, Found: %', v_req.item_name, (v_ing IS NOT NULL);
    END IF;

    -- Create Financial Movement (Pending)
    IF v_req.cost > 0 THEN
        INSERT INTO financial_movements (description, amount, type, status, related_purchase_id, due_date)
        VALUES (
            'Compra: ' || v_req.item_name,
            -ABS(v_req.cost), -- Expense is negative
            'expense',
            'pending',
            v_req.id,
            NOW()
        );
    END IF;

    -- Update Request Status
    UPDATE purchase_requests 
    SET status = 'approved', approved_by = p_user_id, approved_at = NOW() 
    WHERE id = p_request_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
