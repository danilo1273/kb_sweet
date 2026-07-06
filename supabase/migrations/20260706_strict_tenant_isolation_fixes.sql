-- Migration: 20260706_strict_tenant_isolation_fixes.sql
-- Goal: Drop permissive policies that bypass tenant isolation and isolate custom_categories / custom_units.

-- 1. Remover políticas permissivas legadas que anulam o Tenant Isolation
DROP POLICY IF EXISTS "Enable all access for authenticated for clients" ON public.clients;
DROP POLICY IF EXISTS "Public profiles are viewable by everyone." ON public.profiles;
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.audit_logs;

-- 2. Isolar tabela custom_categories
ALTER TABLE public.custom_categories ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
UPDATE public.custom_categories SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.custom_categories;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.custom_categories;
CREATE POLICY "Tenant Isolation" ON public.custom_categories
  FOR ALL USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id());

-- 3. Isolar tabela custom_units
ALTER TABLE public.custom_units ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) DEFAULT get_user_company_id();
UPDATE public.custom_units SET company_id = 'e1687e32-cbce-42f0-8957-e0ca7c73679f' WHERE company_id IS NULL;
DROP POLICY IF EXISTS "Enable all access for all users" ON public.custom_units;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.custom_units;
CREATE POLICY "Tenant Isolation" ON public.custom_units
  FOR ALL USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id());

-- 4. Garantir que as tabelas de auditoria tenham isolamento estrito
DROP POLICY IF EXISTS "Enable read for authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Enable insert for authenticated users" ON public.audit_logs;
DROP POLICY IF EXISTS "Tenant Isolation" ON public.audit_logs;
CREATE POLICY "Tenant Isolation" ON public.audit_logs
  FOR ALL USING (company_id = get_user_company_id()) WITH CHECK (company_id = get_user_company_id());
