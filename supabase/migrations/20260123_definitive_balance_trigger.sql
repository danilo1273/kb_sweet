-- Definitive Fix: Idempotent Bank Balance Trigger
-- Author: Antigravity
-- Date: 2026-01-23

-- 1. Redefine the Trigger Function to be IDEMPOTENT (Calculate from Scratch)
-- This eliminates any possibility of "drift" or "double counting" because it doesn't trust the old balance.
-- It always recalculates based on the source of truth (financial_movements).

CREATE OR REPLACE FUNCTION text(val numeric) RETURNS text AS $$
BEGIN
    RETURN val::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION fn_update_bank_balance()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_account_id UUID;
    v_sum NUMERIC;
    v_initial NUMERIC;
BEGIN
    -- Determine which account to update
    IF (TG_OP = 'DELETE') THEN
        v_account_id := OLD.bank_account_id;
    ELSE
        v_account_id := NEW.bank_account_id;
    END IF;

    -- If account is involved
    IF v_account_id IS NOT NULL THEN
        -- 1. Get Initial Balance (and Lock the row to prevent race conditions)
        SELECT initial_balance INTO v_initial FROM bank_accounts WHERE id = v_account_id FOR UPDATE;
        
        -- 2. Calculate TRUE SUM of all PAID movements for this account
        SELECT COALESCE(SUM(
            CASE 
                WHEN type = 'income' THEN ABS(amount)
                WHEN type = 'expense' THEN -ABS(amount)
                ELSE 0
            END
        ), 0)
        INTO v_sum
        FROM financial_movements
        WHERE bank_account_id = v_account_id 
          AND status = 'paid';

        -- 3. Set the definitive balance
        UPDATE bank_accounts
        SET balance = COALESCE(v_initial, 0) + v_sum
        WHERE id = v_account_id;

        -- Handle Transfer case (If account changed in an UPDATE, we must update the OLD account too)
        IF (TG_OP = 'UPDATE' AND OLD.bank_account_id IS NOT NULL AND OLD.bank_account_id != NEW.bank_account_id) THEN
            -- Recalculate OLD account
            SELECT initial_balance INTO v_initial FROM bank_accounts WHERE id = OLD.bank_account_id FOR UPDATE;
            
            SELECT COALESCE(SUM(
                CASE 
                    WHEN type = 'income' THEN ABS(amount)
                    WHEN type = 'expense' THEN -ABS(amount)
                    ELSE 0
                END
            ), 0)
            INTO v_sum
            FROM financial_movements
            WHERE bank_account_id = OLD.bank_account_id 
            AND status = 'paid';

            UPDATE bank_accounts
            SET balance = COALESCE(v_initial, 0) + v_sum
            WHERE id = OLD.bank_account_id;
        END IF;

    END IF;

    RETURN NULL;
END;
$function$;

-- 2. Force Global Resync (Just to be sure everything starts correct)
DO $$
DECLARE
    r RECORD;
    v_sum NUMERIC;
BEGIN
    FOR r IN SELECT id, name, initial_balance FROM bank_accounts LOOP
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

        UPDATE bank_accounts
        SET balance = COALESCE(r.initial_balance, 0) + v_sum
        WHERE id = r.id;
    END LOOP;
END $$;
