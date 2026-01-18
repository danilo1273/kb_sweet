
-- Fix product_stocks schema to allow 'products' table IDs (which are distinct from ingredients)
-- 1. Drop the FK constraint that forces product_id to be an ingredient
ALTER TABLE product_stocks DROP CONSTRAINT IF EXISTS product_stocks_product_id_fkey;

-- 2. Migrate Data from 'products' table (Finished/Intermediate)
DO $$
DECLARE
    r RECORD;
    loc_danilo UUID;
    loc_adriel UUID;
BEGIN
    FOR r IN SELECT id FROM companies LOOP
        -- Get Location IDs (they should exist from previous migration)
        SELECT id INTO loc_danilo FROM stock_locations WHERE company_id = r.id AND slug = 'stock-danilo';
        SELECT id INTO loc_adriel FROM stock_locations WHERE company_id = r.id AND slug = 'stock-adriel';

        -- Safety check
        IF loc_danilo IS NOT NULL THEN
            INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
            SELECT id, loc_danilo, COALESCE(stock_danilo, 0), COALESCE(cost, 0)
            FROM products
            WHERE company_id = r.id
            ON CONFLICT (product_id, location_id) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                average_cost = EXCLUDED.average_cost;
        END IF;

        IF loc_adriel IS NOT NULL THEN
            INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
            SELECT id, loc_adriel, COALESCE(stock_adriel, 0), COALESCE(cost, 0)
            FROM products
            WHERE company_id = r.id
            ON CONFLICT (product_id, location_id) DO UPDATE SET
                quantity = EXCLUDED.quantity,
                average_cost = EXCLUDED.average_cost;
        END IF;

    END LOOP;
END $$;
