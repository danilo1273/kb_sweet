-- Force Fix Bank Balances
-- Author: Antigravity
-- Date: 2026-01-23
-- Purpose: The Dashboard (stored balance) drifted from the Banking Screen (calculated balance). this script forces them to match.

DO $$
DECLARE
    r RECORD;
    v_sum NUMERIC;
BEGIN
    RAISE NOTICE 'Starting FORCE Fix of Bank Balances...';
    
    FOR r IN SELECT id, name, initial_balance FROM bank_accounts LOOP
        
        -- Calculate TRUE sum from history
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

        -- FORCE Update the balance
        UPDATE bank_accounts
        SET balance = COALESCE(r.initial_balance, 0) + v_sum
        WHERE id = r.id;
        
        RAISE NOTICE 'Fixed Account %: Initial % + Mvmts % = New Balance %', r.name, r.initial_balance, v_sum, (COALESCE(r.initial_balance, 0) + v_sum);
        
    END LOOP;
    
    RAISE NOTICE 'Balances Fixed.';
END $$;
