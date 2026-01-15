-- Migration: Secure Purchase System (RPCs for Approving, Reverting, and Deleting)

-- Helper function to normalize strings for comparison (matches frontend logic)
CREATE OR REPLACE FUNCTION normalize_text(p_text text) RETURNS text AS $$
BEGIN
    RETURN lower(trim(p_text));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 1. RPC: Approve Purchase Item (Transactional)
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
            -- Default fallthrough (1) if no unit match found, essentially assuming units match or are 1:1 if unknown
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
        -- Avoid division by zero
        IF v_new_owner_stock > 0 THEN
             v_new_owner_avg := ((COALESCE(v_ing.stock_danilo, 0) * v_current_owner_cost) + v_req.cost) / v_new_owner_stock; 
             -- Wait, the math above for specific owner avg uses the wrong previous stock. 
             -- Correct: ((OwnerStock * OwnerCost) + NewCost) / NewOwnerStock
             -- NOTE: v_ing.stock_danilo in that line was likely a copy paste error in my thought process? 
             -- Let's stick to the variable:
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
        -- We construct dynamic query or just plain IF/ELSE update for safety and clarity
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
        
        -- IF the item name/unit was not mapped but matched by name, we could update the request to link it? 
        -- For now let's leave as is, but maybe useful for future.
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


-- 2. RPC: Revert Purchase Item (Transactional)
CREATE OR REPLACE FUNCTION revert_purchase_item(
    p_request_id UUID
) RETURNS void AS $$
DECLARE
    v_req record;
    v_ing record;
    v_factor numeric := 1;
    v_converted_qty numeric;
    v_new_owner_stock numeric;
BEGIN
    -- Fetch Request
    SELECT * INTO v_req FROM purchase_requests WHERE id = p_request_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Item de pedido não encontrado'; END IF;
    
    -- Only revert if currently approved/edit_approved
    IF v_req.status NOT IN ('approved', 'edit_approved') THEN 
        -- If it's already pending, just do nothing or error? 
        -- Let's safe-return to be idempotent
        RETURN; 
    END IF;

    -- Fetch Ingredient (if linked or match)
    IF v_req.ingredient_id IS NULL THEN
        SELECT * INTO v_ing FROM ingredients 
        WHERE normalize_text(name) = normalize_text(v_req.item_name)
        LIMIT 1;
    ELSE
        SELECT * INTO v_ing FROM ingredients WHERE id = v_req.ingredient_id;
    END IF;

    -- Revert Stock Logic
    -- Note: We DO NOT revert Cost Average because it is mathematically complex to "un-average" without full history.
    -- We assume the current average is "good enough" or that the user will fix it if it was a massive error.
    -- We primarily care about fixing the Quantity and removing the Financial obligation.
    
    IF v_ing IS NOT NULL AND v_ing.type <> 'expense' THEN
         -- Factor
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

        IF v_req.destination = 'adriel' THEN
            v_new_owner_stock := GREATEST(0, COALESCE(v_ing.stock_adriel, 0) - v_converted_qty);
            UPDATE ingredients SET stock_adriel = v_new_owner_stock WHERE id = v_ing.id;
        ELSE
            v_new_owner_stock := GREATEST(0, COALESCE(v_ing.stock_danilo, 0) - v_converted_qty);
            UPDATE ingredients SET stock_danilo = v_new_owner_stock WHERE id = v_ing.id;
        END IF;
    END IF;

    -- Delete Financial Movement
    DELETE FROM financial_movements WHERE related_purchase_id = v_req.id;

    -- Reset Status
    UPDATE purchase_requests 
    SET status = 'pending', approved_by = NULL, approved_at = NULL 
    WHERE id = p_request_id;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 3. RPC: Secure Delete Purchase Order (Transactional with Audit)
CREATE OR REPLACE FUNCTION secure_delete_purchase_order(
    p_order_id UUID,
    p_reason text,
    p_user_id UUID
) RETURNS void AS $$
DECLARE
    r_item record;
    v_order_nickname text;
    v_user_email text;
BEGIN
    SELECT nickname INTO v_order_nickname FROM purchase_orders WHERE id = p_order_id;
    SELECT email INTO v_user_email FROM auth.users WHERE id = p_user_id;

    -- 1. Loop through all items and Revert valid ones
    FOR r_item IN SELECT * FROM purchase_requests WHERE order_id = p_order_id LOOP
        PERFORM revert_purchase_item(r_item.id);
        
        -- After revert (or if it was pending), we delete the request itself
        -- But revert_purchase_item only reverts statuses/stock, it doesn't delete the request row yet.
        -- So we can proceed to delete the row.
    END LOOP;

    -- 2. Delete Requests Row
    -- Note: revert_purchase_item updates rows, so we can now delete them.
    -- However, we must ensure Financials are gone. revert_purchase_item handles that.
    DELETE FROM purchase_requests WHERE order_id = p_order_id;

    -- 3. Delete Order Header
    DELETE FROM purchase_orders WHERE id = p_order_id;

    -- 4. Log Audit
    INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by, reason)
    VALUES (
        'purchase_orders',
        p_order_id,
        'DELETE',
        jsonb_build_object('nickname', v_order_nickname, 'items_count', (SELECT count(*) FROM purchase_requests WHERE order_id = p_order_id)),
        NULL,
        p_user_id,
        p_reason
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
