
-- Create stock_locations table
CREATE TABLE IF NOT EXISTS stock_locations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    is_default BOOLEAN DEFAULT false,
    type TEXT DEFAULT 'physical',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(company_id, slug)
);

-- Create product_stocks table
CREATE TABLE IF NOT EXISTS product_stocks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    location_id UUID NOT NULL REFERENCES stock_locations(id) ON DELETE CASCADE,
    quantity NUMERIC DEFAULT 0,
    average_cost NUMERIC DEFAULT 0,
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(product_id, location_id)
);

-- Enable RLS
ALTER TABLE stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_stocks ENABLE ROW LEVEL SECURITY;

-- Policies for stock_locations
DROP POLICY IF EXISTS "Users can view stock locations of their company" ON stock_locations;
CREATE POLICY "Users can view stock locations of their company" ON stock_locations
    FOR SELECT USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "Admins can manage stock locations" ON stock_locations;
CREATE POLICY "Admins can manage stock locations" ON stock_locations
    FOR ALL USING (
        company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()) AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (role = 'admin' OR roles @> ARRAY['admin']))
    );

-- Policies for product_stocks
DROP POLICY IF EXISTS "Users can view product stocks of their company" ON product_stocks;
CREATE POLICY "Users can view product stocks of their company" ON product_stocks
    FOR SELECT USING (
        location_id IN (SELECT id FROM stock_locations WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
    );

DROP POLICY IF EXISTS "Authorized users can update product stocks" ON product_stocks;
CREATE POLICY "Authorized users can update product stocks" ON product_stocks
    FOR ALL USING (
        location_id IN (SELECT id FROM stock_locations WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())) AND
        EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND (
            role IN ('admin', 'buyer', 'approver', 'stock_manager') OR 
            roles && ARRAY['admin', 'buyer', 'approver', 'stock_manager']::text[]
        ))
    );

-- Migration logic
DO $$
DECLARE
    r RECORD;
    loc_danilo UUID;
    loc_adriel UUID;
BEGIN
    FOR r IN SELECT id FROM companies LOOP
        -- Create/Get "Estoque Danilo"
        INSERT INTO stock_locations (company_id, name, slug, is_default)
        VALUES (r.id, 'Estoque Danilo', 'stock-danilo', true)
        ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO loc_danilo;

        -- Create/Get "Estoque Adriel"
        INSERT INTO stock_locations (company_id, name, slug, is_default)
        VALUES (r.id, 'Estoque Adriel', 'stock-adriel', false)
        ON CONFLICT (company_id, slug) DO UPDATE SET name = EXCLUDED.name
        RETURNING id INTO loc_adriel;

        -- Migrate Danilo Stock
        INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
        SELECT id, loc_danilo, COALESCE(stock_danilo, 0), COALESCE(cost_danilo, cost, 0)
        FROM ingredients
        WHERE company_id = r.id
        ON CONFLICT (product_id, location_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            average_cost = EXCLUDED.average_cost;

        -- Migrate Adriel Stock
        INSERT INTO product_stocks (product_id, location_id, quantity, average_cost)
        SELECT id, loc_adriel, COALESCE(stock_adriel, 0), COALESCE(cost_adriel, cost, 0)
        FROM ingredients
        WHERE company_id = r.id
        ON CONFLICT (product_id, location_id) DO UPDATE SET
            quantity = EXCLUDED.quantity,
            average_cost = EXCLUDED.average_cost;
            
    END LOOP;
END $$;
