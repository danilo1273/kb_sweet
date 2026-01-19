-- Create Raffles Table
CREATE TABLE IF NOT EXISTS raffles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'open', 'completed')),
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    ticket_value NUMERIC NOT NULL DEFAULT 50.00,
    total_cost NUMERIC DEFAULT 0.00, -- Managerial cost of prizes
    winner_client_id UUID REFERENCES clients(id),
    winner_ticket_number INT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create Raffle Prizes Table
CREATE TABLE IF NOT EXISTS raffle_prizes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raffle_id UUID NOT NULL REFERENCES raffles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES products(id),
    quantity INTEGER NOT NULL DEFAULT 1,
    unit_cost NUMERIC NOT NULL DEFAULT 0.00, -- Snapshot cost at registration
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE raffles ENABLE ROW LEVEL SECURITY;
ALTER TABLE raffle_prizes ENABLE ROW LEVEL SECURITY;

-- Policies (Assuming authenticated users/admins can do everything for now)
CREATE POLICY "Enable all access for authenticated users" ON raffles FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON raffle_prizes FOR ALL USING (auth.role() = 'authenticated');

-- Trigger for Updated At
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_raffles_updated_at BEFORE UPDATE ON raffles FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();
