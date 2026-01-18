-- OPTIONAL: Run this logic ONLY if you want to migrate your OLD stock numbers to the new system.
-- This will populate the new 'product_stocks' table with values from the legacy 'stock_quantity' column.

DO $$
DECLARE
    v_location_id uuid;
BEGIN
    -- Get default location (Danilo)
    SELECT id INTO v_location_id FROM stock_locations WHERE slug = 'stock-danilo';
    
    -- If not found, get any
    IF v_location_id IS NULL THEN
        SELECT id INTO v_location_id FROM stock_locations LIMIT 1;
    END IF;

    IF v_location_id IS NOT NULL THEN
        -- Link existing product_stocks to the legacy 'stock_danilo' or 'stock_quantity'
        -- We UPDATE the entry we just created (which is 0 or negative) adding the legacy amount.
        -- BUT, only if the legacy amount is meaningful (>0).
        
        -- Strategy: Update product_stocks SET quantity = p.stock_danilo
        -- This overwrites the '0' start.
        
        -- NOTE: Using 'stock_quantity' as the source. Adjusted if you use 'stock_danilo' specifically.
        -- Assuming 'stock_quantity' was the master column previously used.
        
        UPDATE product_stocks ps
        SET quantity = COALESCE(p.stock_quantity, 0)
        FROM products p
        WHERE ps.product_id = p.id
        AND ps.location_id = v_location_id
        AND ps.quantity <= 0 -- Only fix those that are 0 or displayed as negative due to recent sales
        AND COALESCE(p.stock_quantity, 0) > 0; -- Only if there IS valid old stock
        
    END IF;
END $$;
