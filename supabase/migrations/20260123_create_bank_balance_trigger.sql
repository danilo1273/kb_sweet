-- Migration: Create Bank Balance Trigger and Resync
-- Author: Antigravity
-- Date: 2026-01-23

-- 1. Create the Trigger
-- This was missing. It binds the fn_update_bank_balance function to the financial_movements table.
-- It ensures that any INSERT, UPDATE, or DELETE on financial_movements automatically updates the bank_accounts.balance.

DROP TRIGGER IF EXISTS tr_update_bank_balance ON financial_movements;

CREATE TRIGGER tr_update_bank_balance
AFTER INSERT OR UPDATE OR DELETE ON financial_movements
FOR EACH ROW
EXECUTE FUNCTION fn_update_bank_balance();

-- 2. Force Resync of All Bank Balances
-- Since the trigger was missing, balances are likely out of sync.
-- This block recalculates the balance for every account based on its initial_balance + sum of paid movements.

DO $$
DECLARE
    r RECORD;
    v_sum NUMERIC;
BEGIN
    RAISE NOTICE 'Starting Bank Balance Resync...';
    
    FOR r IN SELECT id, name, initial_balance FROM bank_accounts LOOP
        
        -- Calculate sum of all PAID movements for this account
        -- Income is positive, Expense is negative (stored as negative or positive? 
        -- Frontend/Logic says: Income = +ABS(amount), Expense = -ABS(amount))
        
        SELECT COALESCE(SUM(
            CASE 
                WHEN type = 'income' THEN ABS(amount)
                WHEN type = 'expense' THEN -ABS(amount)
                ELSE 0
            END
        ), 0)
        INTO v_sum
        FROM financial_movements
        WHERE bank_account_id = r.id 
          AND status = 'paid';

        -- Update the balance
        UPDATE bank_accounts
        SET balance = COALESCE(r.initial_balance, 0) + v_sum
        WHERE id = r.id;
        
        RAISE NOTICE 'Updated Account %: Initial % + Mvmts % = New Balance %', r.name, r.initial_balance, v_sum, (COALESCE(r.initial_balance, 0) + v_sum);
        
    END LOOP;
    
    RAISE NOTICE 'Bank Balance Resync Completed.';
END $$;
