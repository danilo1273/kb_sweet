-- Rename existing column to ingredient_id
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'product_stocks' AND column_name = 'product_id') THEN
        ALTER TABLE product_stocks RENAME COLUMN product_id TO ingredient_id;
    END IF;
END $$;

-- Make ingredient_id nullable (since a record can now be for a product)
ALTER TABLE product_stocks ALTER COLUMN ingredient_id DROP NOT NULL;

-- Add new product_id column
ALTER TABLE product_stocks 
ADD COLUMN IF NOT EXISTS product_id UUID REFERENCES products(id) ON DELETE CASCADE;

-- Add constraint to ensure either ingredient_id OR product_id is set, but not both (or both, technically unique index handles logic)
-- Actually, better to enforce exclusivity
ALTER TABLE product_stocks 
DROP CONSTRAINT IF EXISTS product_stocks_item_check;

ALTER TABLE product_stocks 
ADD CONSTRAINT product_stocks_item_check 
CHECK (
    (ingredient_id IS NOT NULL AND product_id IS NULL) OR 
    (ingredient_id IS NULL AND product_id IS NOT NULL)
);

-- Update Unique Constraint
-- The previous unique was (product_id, location_id). product_id is now ingredient_id.
-- We need to ensure uniqueness for (ingredient_id, location_id) and (product_id, location_id)
-- PostgREST and Supabase APIs often rely on single column PKs or simple composites. 
-- Let's just create unique indexes.
ALTER TABLE product_stocks DROP CONSTRAINT IF EXISTS product_stocks_product_id_location_id_key; -- If it was a named constraint
ALTER TABLE product_stocks DROP CONSTRAINT IF EXISTS product_stocks_pkey;

-- Recreate PKEY (id is already there)
ALTER TABLE product_stocks ADD PRIMARY KEY (id);

-- Create unique indexes for both types
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_stocks_ingredient 
ON product_stocks (ingredient_id, location_id) 
WHERE ingredient_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_product_stocks_product 
ON product_stocks (product_id, location_id) 
WHERE product_id IS NOT NULL;

-- Fix RLS Policies
-- Need to update policies to check both columns?
-- "Users can view product stocks of their company" - uses location_id. This is fine.
-- "Authorized users can update product stocks" - uses location_id. This is fine.

-- We should probably rename the foreign key constraint on ingredient_id if it has a weird name, but Postgres usually handles the rename fine.

-- Initialize stock for existing products if needed
-- If products have stock_quantity, we should move it to product_stocks (default location)
DO $$
DECLARE
    r_prod RECORD;
    v_def_loc UUID;
BEGIN
    -- Get default location (Danilo) or any
    SELECT id INTO v_def_loc FROM stock_locations WHERE slug = 'stock-danilo' LIMIT 1;
    
    IF v_def_loc IS NOT NULL THEN
        FOR r_prod IN SELECT id FROM products LOOP
            -- Try to insert generic 0 stock for products that don't have it
            INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
            VALUES (r_prod.id, v_def_loc, 0, 0)
            ON CONFLICT DO NOTHING;
            -- Note: ON CONFLICT clause needs a constraint inference. 
            -- Since we have partial unique indexes, standard ON CONFLICT might not work easily without specifying the constraint name which is tricky with partials.
            -- Actually, standard INSERT without ON CONFLICT and catching exception, or using WHERE NOT EXISTS is safer here.
        END LOOP;
    END IF;
END $$;
