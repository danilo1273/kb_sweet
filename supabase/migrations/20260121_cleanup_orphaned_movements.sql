-- Migration to clean up orphaned financial movements

-- 1. Delete financial movements that reference a non-existent sale via detail_order_id
DELETE FROM financial_movements 
WHERE detail_order_id IS NOT NULL 
AND detail_order_id NOT IN (SELECT id FROM sales);

-- 2. Delete legacy financial movements (where detail_order_id is NULL) that match the 'Venda PDV' pattern
-- but do not match any existing Sale ID (by the string prefix logic used in creation)
DELETE FROM financial_movements fm
WHERE fm.description LIKE 'Venda PDV %'
AND fm.detail_order_id IS NULL
AND NOT EXISTS (
    SELECT 1 FROM sales s
    WHERE fm.description LIKE 'Venda PDV #' || left(s.id::text, 8) || '%'
);

-- 3. Optional: Backfill detail_order_id for existing legacy sales to prevent future issues
DO $$
DECLARE
    r RECORD;
    v_sale_id UUID;
BEGIN
    FOR r IN SELECT id, description FROM financial_movements WHERE detail_order_id IS NULL AND description LIKE 'Venda PDV %' LOOP
        -- Try to find a sales match
        SELECT id INTO v_sale_id FROM sales 
        WHERE description LIKE 'Venda PDV #' || left(id::text, 8) || '%'
        LIMIT 1;

        IF v_sale_id IS NOT NULL THEN
            UPDATE financial_movements SET detail_order_id = v_sale_id WHERE id = r.id;
        END IF;
    END LOOP;
END $$;
