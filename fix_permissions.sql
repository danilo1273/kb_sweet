
-- ====================================================
-- SCRIPT DE CORREÇÃO DE PERMISSÕES (RLS)
-- ====================================================

-- 1. CLIENTS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read access for all for clients" ON clients;
DROP POLICY IF EXISTS "Enable all access for authenticated for clients" ON clients;

CREATE POLICY "Enable all access for authenticated for clients"
ON clients
FOR ALL
USING (auth.role() = 'authenticated'); -- Qualquer usuário logado pode ler/editar

-- 2. SALES
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated for sales" ON sales;

CREATE POLICY "Enable all access for authenticated for sales"
ON sales
FOR ALL
USING (auth.role() = 'authenticated');

-- 3. SALE ITEMS
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated for sale_items" ON sale_items;

CREATE POLICY "Enable all access for authenticated for sale_items"
ON sale_items
FOR ALL
USING (auth.role() = 'authenticated');

-- 4. FINANCIAL MOVEMENTS
ALTER TABLE financial_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated for financial_movements" ON financial_movements;

CREATE POLICY "Enable all access for authenticated for financial_movements"
ON financial_movements
FOR ALL
USING (auth.role() = 'authenticated');

-- 5. PRODUCTS (Read Only for anon, Write for Auth)
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Auth write products" ON products;

CREATE POLICY "Public read products" ON products FOR SELECT USING (true);
CREATE POLICY "Auth write products" ON products FOR ALL USING (auth.role() = 'authenticated');
