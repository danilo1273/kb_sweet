-- Migration: 20260706_rls_multi_tenant_isolation.sql
-- Goal: Multi-tenant data isolation using Row Level Security (RLS) and company_id.

-- 1. DROP permissive legacy policies that bypass tenant isolation
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.ingredients;
DROP POLICY IF EXISTS "Enable all for authenticated" ON public.products;
DROP POLICY IF EXISTS "Auth write products" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Permitir tudo para autenticados" ON public.purchase_requests;
DROP POLICY IF EXISTS "Users can update their own pending requests" ON public.purchase_requests;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.suppliers;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.suppliers;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON public.financial_movements;
DROP POLICY IF EXISTS "Enable all access for authenticated for financial_movements" ON public.financial_movements;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.purchase_orders;
DROP POLICY IF EXISTS "Enable all access for authenticated for sale_items" ON public.sale_items;
DROP POLICY IF EXISTS "Enable all access for authenticated for sales" ON public.sales;
DROP POLICY IF EXISTS "Enable read access for authenticated users" ON public.production_orders;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.production_orders;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.production_order_items;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.production_order_items;
DROP POLICY IF EXISTS "Full access for authenticated" ON public.production_order_items;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.stock_adjustments;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.pix_keys;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.raffles;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.raffle_prizes;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.product_bom;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.purchase_edits_history;

-- 2. Garantir que todas as tabelas principais tenham o company_id preenchido (não nulo)
-- Mapear os registros antigos órfãos para a empresa padrão 'KB Sweet' (id: 'e1687e32-cbce-42f0-8957-e0ca7c73679f')
UPDATE public.products SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.ingredients SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.clients SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.suppliers SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.sales SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.sale_items SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.financial_movements SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.purchase_orders SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.purchase_requests SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.production_orders SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.profiles SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;

-- 3. Habilitar RLS em tabelas que estavam desprotegidas
ALTER TABLE public.production_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stocks ENABLE ROW LEVEL SECURITY;

-- 4. Adicionar coluna company_id com default nas tabelas secundárias
ALTER TABLE public.product_bom ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.product_stocks ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.stock_adjustments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.product_stock_adjustments ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.production_order_items ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.pix_keys ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.raffles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.raffle_prizes ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.purchase_edits_history ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();

-- Limpar dados órfãos antes do mapeamento para evitar violação de integridade referencial/not-null
DELETE FROM public.product_bom WHERE product_id NOT IN (SELECT id FROM public.products);
DELETE FROM public.product_stocks WHERE location_id NOT IN (SELECT id FROM public.stock_locations);

-- 5. Atualizar registros existentes para herdar company_id corretamente nas secundárias
UPDATE public.product_stocks ps SET company_id = sl.company_id FROM public.stock_locations sl WHERE ps.location_id = sl.id AND ps.company_id IS NULL;
UPDATE public.product_bom pb SET company_id = p.company_id FROM public.products p WHERE pb.product_id = p.id AND pb.company_id IS NULL;
UPDATE public.stock_adjustments sa SET company_id = sl.company_id FROM public.stock_locations sl WHERE (sa.stock_owner = sl.slug OR sa.stock_owner = REPLACE(sl.slug, 'stock-', '')) AND sa.company_id IS NULL;
UPDATE public.stock_adjustments sa SET company_id = p.company_id FROM public.profiles p WHERE sa.user_id = p.id AND sa.company_id IS NULL;
UPDATE public.product_stock_adjustments psa SET company_id = p.company_id FROM public.products p WHERE psa.product_id = p.id AND psa.company_id IS NULL;
UPDATE public.product_stock_adjustments psa SET company_id = pr.company_id FROM public.profiles pr WHERE psa.user_id = pr.id AND psa.company_id IS NULL;
UPDATE public.production_order_items poi SET company_id = po.company_id FROM public.production_orders po WHERE poi.order_id = po.id AND poi.company_id IS NULL;
UPDATE public.purchase_edits_history peh SET company_id = pr.company_id FROM public.purchase_requests pr WHERE peh.purchase_request_id = pr.id AND peh.company_id IS NULL;
UPDATE public.audit_logs al SET company_id = p.company_id FROM public.profiles p WHERE al.changed_by = p.id AND al.company_id IS NULL;
UPDATE public.pix_keys SET company_id = (SELECT company_id FROM public.profiles LIMIT 1) WHERE company_id IS NULL;
UPDATE public.raffles r SET company_id = c.company_id FROM public.clients c WHERE r.winner_client_id = c.id AND r.company_id IS NULL;
UPDATE public.raffles SET company_id = (SELECT company_id FROM public.profiles LIMIT 1) WHERE company_id IS NULL;
UPDATE public.raffle_prizes rp SET company_id = r.company_id FROM public.raffles r WHERE rp.raffle_id = r.id AND rp.company_id IS NULL;

-- 6. Garantir que não restem nulos em product_stocks e product_bom
UPDATE public.product_stocks SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
UPDATE public.product_bom SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;

ALTER TABLE public.product_stocks ALTER COLUMN company_id SET NOT NULL;
ALTER TABLE public.product_bom ALTER COLUMN company_id SET NOT NULL;

-- 7. Criar políticas de Tenant Isolation baseadas em company_id
DO $$
DECLARE
    t text;
    tables_list text[] := ARRAY[
        'ingredients', 'products', 'clients', 'suppliers', 'sales', 'sale_items', 
        'financial_movements', 'purchase_orders', 'purchase_requests', 'production_orders',
        'production_order_items', 'bank_accounts', 'stock_adjustments', 'product_stock_adjustments',
        'pix_keys', 'raffles', 'raffle_prizes', 'product_bom', 'purchase_edits_history',
        'audit_logs', 'product_stocks'
    ];
BEGIN
    FOREACH t IN ARRAY tables_list LOOP
        EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation" ON public.%I', t);
        EXECUTE format('CREATE POLICY "Tenant Isolation" ON public.%I FOR ALL USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id())', t);
    END LOOP;
END $$;

-- 8. Corrigir trigger de vendas para restaurar estoque de forma dinâmica no cancelamento/deleção
CREATE OR REPLACE FUNCTION public.restore_sales_stock()
RETURNS TRIGGER AS $$
DECLARE
    r_item RECORD;
    v_location_id uuid;
    v_stock_exists boolean;
BEGIN
    -- Obter location_id da venda antiga se houver
    v_location_id := OLD.location_id;

    -- Loop pelos itens da venda sendo deletada
    FOR r_item IN SELECT product_id, quantity FROM public.sale_items WHERE sale_id = OLD.id
    LOOP
        -- Se houver localização de estoque selecionada, restabelecemos nela
        IF v_location_id IS NOT NULL THEN
            SELECT EXISTS (
                SELECT 1 FROM public.product_stocks 
                WHERE product_id = r_item.product_id AND location_id = v_location_id
            ) INTO v_stock_exists;

            IF v_stock_exists THEN
                UPDATE public.product_stocks 
                SET quantity = quantity + r_item.quantity, last_updated = now()
                WHERE product_id = r_item.product_id AND location_id = v_location_id;
            ELSE
                INSERT INTO public.product_stocks (product_id, location_id, quantity, average_cost, company_id)
                VALUES (r_item.product_id, v_location_id, r_item.quantity, 0, OLD.company_id);
            END IF;
        END IF;

        -- Fallback de espelhamento legado (para compatibilidade com colunas antigas)
        IF OLD.stock_source = 'danilo' THEN
            UPDATE public.products 
            SET stock_danilo = COALESCE(stock_danilo, 0) + r_item.quantity 
            WHERE id = r_item.product_id;
        ELSIF OLD.stock_source = 'adriel' THEN
            UPDATE public.products 
            SET stock_adriel = COALESCE(stock_adriel, 0) + r_item.quantity 
            WHERE id = r_item.product_id;
        END IF;
    END LOOP;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
