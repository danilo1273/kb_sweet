-- Secure Financial RPCs
-- Ensures atomic updates for payments, reversals, and deletions with audit logging.

-- 1. Secure Single Payment
CREATE OR REPLACE FUNCTION pay_financial_movement_secure(
    p_movement_id UUID,
    p_payment_date TIMESTAMP WITH TIME ZONE,
    p_bank_account_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_movement RECORD;
    v_old_status TEXT;
BEGIN
    -- Get current state
    SELECT * INTO v_movement FROM financial_movements WHERE id = p_movement_id;
    
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Movimentação não encontrada.';
    END IF;

    IF v_movement.status = 'paid' THEN
        RAISE EXCEPTION 'Movimentação já está paga.';
    END IF;

    -- Update Movement
    UPDATE financial_movements
    SET 
        status = 'paid',
        payment_date = p_payment_date,
        bank_account_id = p_bank_account_id
    WHERE id = p_movement_id;

    -- Update Bank Balance
    IF p_bank_account_id IS NOT NULL THEN
        IF v_movement.type = 'income' THEN
            UPDATE bank_accounts SET balance = balance + v_movement.amount WHERE id = p_bank_account_id;
        ELSIF v_movement.type = 'expense' THEN
            UPDATE bank_accounts SET balance = balance - v_movement.amount WHERE id = p_bank_account_id;
        END IF;
    END IF;
    
    -- Check Related Sales (Optional but good for consistency)
    -- If it's a sale, we might want to ensure the Sale is also marked completed if it wasn't.
    -- (The existing trigger sync_financial_update_to_sale might handle this, but let's be safe/passive)
    -- If related_sale_id is present, we could check if all payments for that sale are paid.
    -- For now, let's trust the existing triggers or the frontend to refresh.
    
    -- Audit
    INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('financial_movements', p_movement_id, 'pay', 
            jsonb_build_object('amount', v_movement.amount, 'bank_id', p_bank_account_id, 'date', p_payment_date), 
            p_user_id);

    RETURN jsonb_build_object('success', true);
END;
$$ LANGUAGE plpgsql;

-- 2. Secure Reversal
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

    -- Revert Bank Balance
    IF v_movement.bank_account_id IS NOT NULL THEN
        IF v_movement.type = 'income' THEN
            UPDATE bank_accounts SET balance = balance - v_movement.amount WHERE id = v_movement.bank_account_id;
        ELSIF v_movement.type = 'expense' THEN
            UPDATE bank_accounts SET balance = balance + v_movement.amount WHERE id = v_movement.bank_account_id;
        END IF;
    END IF;

    -- Update Movement
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

-- 3. Secure Deletion
CREATE OR REPLACE FUNCTION delete_financial_movement_secure(
    p_movement_id UUID,
    p_user_id UUID
)
RETURNS VOID AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM financial_movements WHERE id = p_movement_id;
    
    IF v_status = 'paid' THEN
        RAISE EXCEPTION 'Não é permitido excluir movimentações pagas. Faça o estorno antes.';
    END IF;

    DELETE FROM financial_movements WHERE id = p_movement_id;
    
    INSERT INTO audit_logs (table_name, record_id, action, new_data, changed_by)
    VALUES ('financial_movements', p_movement_id, 'delete', jsonb_build_object('status_at_delete', v_status), p_user_id);
END;
$$ LANGUAGE plpgsql;

-- 4. Batch Payment
CREATE OR REPLACE FUNCTION pay_batch_financial_movements(
    p_movement_ids UUID[],
    p_payment_date TIMESTAMP WITH TIME ZONE,
    p_bank_account_id UUID,
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_id UUID;
    v_success_count INT := 0;
BEGIN
    FOREACH v_id IN ARRAY p_movement_ids
    LOOP
        -- Call single payment secure function for each
        -- We wrap in a block to ignore errors? Or fail all? 
        -- "Atomic Batch" usually means all or nothing.
        PERFORM pay_financial_movement_secure(v_id, p_payment_date, p_bank_account_id, p_user_id);
        v_success_count := v_success_count + 1;
    END LOOP;
    
    RETURN jsonb_build_object('success', true, 'count', v_success_count);
END;
$$ LANGUAGE plpgsql;
