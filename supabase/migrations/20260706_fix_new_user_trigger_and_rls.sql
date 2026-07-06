-- Migration: 20260706_fix_new_user_trigger_and_rls.sql
-- Goal: Fix handle_new_user trigger to capture company_id and update profiles RLS policy to allow super_admin access.

-- 1. Atualizar a função trigger para capturar company_id do raw_user_meta_data do auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, roles, company_id)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    COALESCE(new.raw_user_meta_data->>'role', 'client'),
    'active',
    ARRAY[COALESCE(new.raw_user_meta_data->>'role', 'client')],
    (new.raw_user_meta_data->>'company_id')::uuid
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar a política RLS da tabela profiles para permitir que super_admin veja e atualize todos os perfis
DROP POLICY IF EXISTS "Tenant Isolation" ON public.profiles;
CREATE POLICY "Tenant Isolation" ON public.profiles 
FOR ALL 
USING (company_id = get_user_company_id() OR is_super_admin()) 
WITH CHECK (company_id = get_user_company_id() OR is_super_admin());

-- 3. Atualizar a RLS da própria tabela de companies para Super Admin ter acesso total
DROP POLICY IF EXISTS "Super Admin sees all companies" ON public.companies;
CREATE POLICY "Super Admin sees all companies" ON public.companies
FOR ALL
USING (is_super_admin());
