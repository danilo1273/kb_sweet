
-- Tabela de Ingredientes
CREATE TABLE IF NOT EXISTS ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    unit TEXT,
    stock_danilo NUMERIC DEFAULT 0,
    stock_adriel NUMERIC DEFAULT 0,
    cost NUMERIC DEFAULT 0,
    min_stock NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabela de Produtos
CREATE TABLE IF NOT EXISTS products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    category TEXT,
    price NUMERIC DEFAULT 0,
    cost NUMERIC DEFAULT 0,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ingredientes do Produto (Ficha Técnica)
CREATE TABLE IF NOT EXISTS product_ingredients (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id UUID REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id UUID REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity NUMERIC NOT NULL
);

-- Vendas
CREATE TABLE IF NOT EXISTS sales (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    total_amount NUMERIC NOT NULL,
    payment_method TEXT,
    client_name TEXT,
    seller_id UUID REFERENCES auth.users(id)
);

-- Itens da Venda
CREATE TABLE IF NOT EXISTS sale_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    quantity NUMERIC NOT NULL,
    unit_price NUMERIC NOT NULL
);

-- Financeiro (Contas a Receber)
CREATE TABLE IF NOT EXISTS receivables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    client_name TEXT NOT NULL,
    amount NUMERIC NOT NULL,
    due_date DATE,
    status TEXT DEFAULT 'pending', -- pending, paid, overdue
    invoice_number TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Pedidos de Compra
CREATE TABLE IF NOT EXISTS purchase_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    item_name TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    unit TEXT,
    status TEXT DEFAULT 'pending', -- pending, approved, rejected
    reason TEXT,
    requested_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_requests ENABLE ROW LEVEL SECURITY;

-- Políticas de Acesso (Simplificado: Usuários Logados podem tudo)
CREATE POLICY "Enable all for authenticated" ON ingredients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON products FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON product_ingredients FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON sales FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON sale_items FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON receivables FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all for authenticated" ON purchase_requests FOR ALL USING (auth.role() = 'authenticated');
