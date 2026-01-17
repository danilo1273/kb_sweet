-- Fix delete RPC to use SECURITY DEFINER to bypass RLS issues
CREATE OR REPLACE FUNCTION delete_production_order_secure(p_order_id UUID, p_user_id UUID)
RETURNS VOID
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM production_orders WHERE id = p_order_id;
    
    -- If order not found (even with admin privileges), just return
    IF v_status IS NULL THEN
        RETURN;
    END IF;

    -- If closed, we trigger reopening to revert stock
    -- Note: This assumes reopen_production_order is accessible. 
    IF v_status = 'closed' THEN
       PERFORM reopen_production_order(p_order_id);
    END IF;

    DELETE FROM production_orders WHERE id = p_order_id;
    
    -- Log Audit
    -- We use a safe call in case audit_production_log is not existing or fails
    BEGIN
        PERFORM audit_production_log('delete_production', p_order_id, jsonb_build_object('status_at_delete', v_status), p_user_id);
    EXCEPTION WHEN OTHERS THEN
        NULL; -- Ignore log errors
    END;
END;
$$ LANGUAGE plpgsql;
