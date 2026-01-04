-- ====================================================
-- SCRIPT DE MIGRACAO: FORNECEDORES E FINANCEIRO
-- ====================================================

-- 1. Tabela de Fornecedores
CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    contact TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Simplificada para Alpha
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.suppliers;
CREATE POLICY "Enable read for authenticated users" ON public.suppliers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.suppliers;
CREATE POLICY "Enable insert for authenticated users" ON public.suppliers FOR INSERT TO authenticated WITH CHECK (true);

-- 2. Atualizar Tabela de Compras
-- Adicionar coluna supplier_id se não existir
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'purchase_requests' AND column_name = 'supplier_id') THEN
        ALTER TABLE public.purchase_requests ADD COLUMN supplier_id UUID REFERENCES public.suppliers(id);
    END IF;
END $$;

-- 3. Tabela de Movimentações Financeiras
CREATE TABLE IF NOT EXISTS public.financial_movements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    description TEXT NOT NULL,
    amount NUMERIC NOT NULL, -- Valor positivo. O tipo define se é entrada ou saída.
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')), -- 'income' (Entrada), 'expense' (Saída)
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    due_date DATE, -- Data de Vencimento
    payment_date DATE, -- Data do Pagamento
    related_purchase_id UUID REFERENCES public.purchase_requests(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS Simplificada para Alpha
ALTER TABLE public.financial_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.financial_movements;
CREATE POLICY "Enable all for authenticated users" ON public.financial_movements FOR ALL TO authenticated USING (true);
