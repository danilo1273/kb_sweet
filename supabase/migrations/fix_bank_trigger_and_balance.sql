-- Migration to fix bank balance trigger logic and resync balances

-- 1. Update the function to handle signs robustly (using ABS logic like the frontend)
CREATE OR REPLACE FUNCTION fn_update_bank_balance()
RETURNS TRIGGER AS $$
DECLARE
    v_diff NUMERIC;
BEGIN
    -- HELPER LOGIC:
    -- If adding a movement (INSERT or status -> paid):
    --   Income: +ABS(amount)
    --   Expense: -ABS(amount)
    -- If removing a movement (DELETE or status -> pending):
    --   Income: -ABS(amount)
    --   Expense: +ABS(amount) (reversing the subtraction)

    -- Handle DELETE or status change (Removing 'paid' effect)
    IF (TG_OP = 'DELETE' AND OLD.status = 'paid') OR (TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status != 'paid') THEN
        IF OLD.bank_account_id IS NOT NULL THEN
            IF OLD.type = 'income' THEN
                UPDATE bank_accounts 
                SET balance = balance - ABS(OLD.amount) 
                WHERE id = OLD.bank_account_id;
            ELSIF OLD.type = 'expense' THEN
                UPDATE bank_accounts 
                SET balance = balance + ABS(OLD.amount) 
                WHERE id = OLD.bank_account_id;
            END IF;
        END IF;
    END IF;

    -- Handle INSERT or status change (Adding 'paid' effect)
    IF (TG_OP = 'INSERT' AND NEW.status = 'paid') OR (TG_OP = 'UPDATE' AND NEW.status = 'paid' AND OLD.status != 'paid') THEN
        IF NEW.bank_account_id IS NOT NULL THEN
            IF NEW.type = 'income' THEN
                UPDATE bank_accounts 
                SET balance = balance + ABS(NEW.amount) 
                WHERE id = NEW.bank_account_id;
            ELSIF NEW.type = 'expense' THEN
                UPDATE bank_accounts 
                SET balance = balance - ABS(NEW.amount) 
                WHERE id = NEW.bank_account_id;
            END IF;
        END IF;
    END IF;

    -- Handle UPDATE on 'paid' records (Changing amount or account while remaining paid)
    -- We simply reverse OLD and apply NEW.
    IF (TG_OP = 'UPDATE' AND OLD.status = 'paid' AND NEW.status = 'paid') THEN
        -- Reverse OLD
        IF OLD.bank_account_id IS NOT NULL THEN
            IF OLD.type = 'income' THEN
                UPDATE bank_accounts SET balance = balance - ABS(OLD.amount) WHERE id = OLD.bank_account_id;
            ELSIF OLD.type = 'expense' THEN
                UPDATE bank_accounts SET balance = balance + ABS(OLD.amount) WHERE id = OLD.bank_account_id;
            END IF;
        END IF;

        -- Apply NEW
        IF NEW.bank_account_id IS NOT NULL THEN
            IF NEW.type = 'income' THEN
                UPDATE bank_accounts SET balance = balance + ABS(NEW.amount) WHERE id = NEW.bank_account_id;
            ELSIF NEW.type = 'expense' THEN
                UPDATE bank_accounts SET balance = balance - ABS(NEW.amount) WHERE id = NEW.bank_account_id;
            END IF;
        END IF;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Recalculate and Resync ALL Bank Balances
-- This script sets the balance to: initial_balance + SUM(movements)
-- Logic mirrors the frontend calculation: Expenses are subtracted (ABS), Income added (ABS)

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
