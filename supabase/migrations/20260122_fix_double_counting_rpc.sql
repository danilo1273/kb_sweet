-- Fix Double Counting in Bank Balances
-- 1. Redefine pay_financial_movement_secure WITHOUT manual bank balance update
-- 2. Redefine reverse_financial_movement_secure WITHOUT manual bank balance update
-- 3. Resync all bank balances

-- 1. Secure Single Payment (Fixed)
CREATE OR REPLACE FUNCTION pay_financial_movement_secure(
    p_movement_id UUID,
    p_payment_date TIMESTAMP WITH TIME ZONE,
    p_bank_account_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_movement RECORD;
BEGIN
    -- Get current state
    SELECT * INTO v_movement FROM financial_movements WHERE id = p_movement_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimentação não encontrada.';
    END IF;

    IF v_movement.status = 'paid' THEN
        RAISE EXCEPTION 'Movimentação já está paga.';
    END IF;

    -- Update Movement (Trigger fn_update_bank_balance will handle the balance update)
    UPDATE financial_movements
    SET 
        status = 'paid',
        payment_date = p_payment_date,
        bank_account_id = p_bank_account_id
    WHERE id = p_movement_id;

    -- Audit
    INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('financial_movements', p_movement_id, 'pay', 
            jsonb_build_object('amount', v_movement.amount, 'bank_id', p_bank_account_id, 'date', p_payment_date), 
            p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 2. Secure Reversal (Fixed)
CREATE OR REPLACE FUNCTION reverse_financial_movement_secure(
    p_movement_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_movement RECORD;
BEGIN
    SELECT * INTO v_movement FROM financial_movements WHERE id = p_movement_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimentação não encontrada.';
    END IF;

    IF v_movement.status != 'paid' THEN
        RAISE EXCEPTION 'Apenas movimentações pagas podem ser estornadas.';
    END IF;

    -- Update Movement (Trigger fn_update_bank_balance will handle the balance revert)
    UPDATE financial_movements
    SET 
        status = 'pending',
        payment_date = NULL,
        bank_account_id = NULL
    WHERE id = p_movement_id;

    -- Audit
    INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('financial_movements', p_movement_id, 'reverse', 
            jsonb_build_object('original_amount', v_movement.amount, 'original_bank', v_movement.bank_account_id), 
            p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 3. Recalculate and Resync ALL Bank Balances
DO $$
DECLARE
    r RECORD;
    v_sum NUMERIC;
BEGIN
    FOR r IN SELECT id, initial_balance FROM bank_accounts LOOP
        
        -- Calculate sum based on paid movements for this account
        SELECT COALESCE(SUM(
            CASE 
                WHEN type = 'income' THEN ABS(amount)
                WHEN type = 'expense' THEN -ABS(amount)
                ELSE 0
            END
        ), 0)
        INTO v_sum
        FROM financial_movements
        WHERE bank_account_id = r.id AND status = 'paid';

        -- Update the bank account balance
        UPDATE bank_accounts
        SET balance = COALESCE(r.initial_balance, 0) + v_sum
        WHERE id = r.id;
        
    END LOOP;
END $$;
