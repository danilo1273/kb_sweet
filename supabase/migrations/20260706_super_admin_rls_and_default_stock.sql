-- Migration: 20260706_super_admin_rls_and_default_stock.sql
-- Goal: Fix stock location slugs for testing company, create trigger to insert default stock locations for new companies, and extend all RLS policies for Super Admin access.

-- 1. Corrigir localizações de teste com slugs legados do Danilo na empresa de teste
UPDATE public.stock_locations 
SET name = 'Estoque Principal', slug = 'estoque-principal' 
WHERE company_id = 'bff816a7-7f7e-4a80-825d-db1ce8d315da' AND slug = 'stock-danilo';

-- 2. Criar trigger para inserir automaticamente o 'Estoque Principal' ao criar uma nova empresa
CREATE OR REPLACE FUNCTION public.handle_new_company_stock_location()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.stock_locations (company_id, name, slug, is_default, type)
  VALUES (NEW.id, 'Estoque Principal', 'estoque-principal', true, 'physical')
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_new_company_stock_location ON public.companies;
CREATE TRIGGER trigger_new_company_stock_location
  AFTER INSERT ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_company_stock_location();

-- 3. Estender as políticas de RLS de Tenant Isolation para conceder acesso total ao Super Admin (evitando bloqueios no painel)

-- Função para atualizar RLS de forma segura
CREATE OR REPLACE PROCEDURE public.update_rls_to_include_super_admin(p_table text) AS $$
BEGIN
  EXECUTE format('DROP POLICY IF EXISTS "Tenant Isolation" ON public.%I', p_table);
  EXECUTE format('CREATE POLICY "Tenant Isolation" ON public.%I FOR ALL USING (company_id = get_user_company_id() OR is_super_admin()) WITH CHECK (company_id = get_user_company_id() OR is_super_admin())', p_table);
END;
$$ LANGUAGE plpgsql;

-- Executar para as tabelas principais
CALL public.update_rls_to_include_super_admin('ingredients');
CALL public.update_rls_to_include_super_admin('products');
CALL public.update_rls_to_include_super_admin('clients');
CALL public.update_rls_to_include_super_admin('suppliers');
CALL public.update_rls_to_include_super_admin('sales');
CALL public.update_rls_to_include_super_admin('sale_items');
CALL public.update_rls_to_include_super_admin('financial_movements');
CALL public.update_rls_to_include_super_admin('purchase_orders');
CALL public.update_rls_to_include_super_admin('purchase_requests');
CALL public.update_rls_to_include_super_admin('production_orders');
CALL public.update_rls_to_include_super_admin('production_order_items');
CALL public.update_rls_to_include_super_admin('bank_accounts');
CALL public.update_rls_to_include_super_admin('stock_adjustments');
CALL public.update_rls_to_include_super_admin('product_stock_adjustments');
CALL public.update_rls_to_include_super_admin('pix_keys');
CALL public.update_rls_to_include_super_admin('raffles');
CALL public.update_rls_to_include_super_admin('raffle_prizes');
CALL public.update_rls_to_include_super_admin('product_bom');
CALL public.update_rls_to_include_super_admin('purchase_edits_history');
CALL public.update_rls_to_include_super_admin('product_stocks');
CALL public.update_rls_to_include_super_admin('custom_categories');
CALL public.update_rls_to_include_super_admin('custom_units');
CALL public.update_rls_to_include_super_admin('audit_logs');

DROP PROCEDURE IF EXISTS public.update_rls_to_include_super_admin(text);

-- 4. Corrigir políticas específicas da tabela stock_locations
DROP POLICY IF EXISTS "Admins can manage stock locations" ON public.stock_locations;
DROP POLICY IF EXISTS "Users can view stock locations of their company" ON public.stock_locations;

CREATE POLICY "Tenant Isolation" ON public.stock_locations
  FOR ALL USING (company_id = get_user_company_id() OR is_super_admin()) WITH CHECK (company_id = get_user_company_id() OR is_super_admin());
