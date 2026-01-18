-- Initialize product_stocks for all finished goods that don't have an entry yet.
-- This ensures they are considered "migrated" and we don't fall back to potentially incorrect legacy data.
-- We initialize with 0 quantity to avoid carrying over test/garbage data.

DO $$
DECLARE
    v_location_id uuid;
BEGIN
    -- Get a default location (e.g., 'stock-danilo' or the first one)
    SELECT id INTO v_location_id FROM stock_locations WHERE slug = 'stock-danilo';
    
    -- If not found, get any location
    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id FROM stock_locations LIMIT 1;
    END IF;

    -- If we have a location, proceed
    IF v_location_id IS NOT NULL THEN
        -- Removed timestamps entirely to avoid column name guesswork (updated_at vs last_updated)
        -- The DB should handle defaults or allow nulls.
        INSERT INTO product_stocks (product_id, location_id, quantity)
        SELECT id, v_location_id, 0
        FROM products p
        WHERE NOT EXISTS (
            SELECT 1 FROM product_stocks ps WHERE ps.product_id = p.id
        );
    END IF;
END $$;
