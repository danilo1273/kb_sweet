-- ====================================================
-- SCRIPT DE CORREÇÃO E AUTOMAÇÃO DE PERFIS (KB SWEET)
-- ====================================================

-- 1. Garante que a coluna 'roles' (Multi-Função) existe
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roles text[] DEFAULT '{}';

-- 2. Sincroniza usuários que já existem no Auth mas não têm Perfil
-- Isso vai "resgatar" o usuário compras@kbsweet.com e outros
INSERT INTO public.profiles (id, email, full_name, role, status, roles)
SELECT 
    id, 
    email, 
    COALESCE(raw_user_meta_data->>'full_name', 'Usuario Sem Nome'), 
    'client', 
    'active', 
    ARRAY['client']
FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);

-- 3. Cria a Função para automatizar novos cadastros
DROP FUNCTION IF EXISTS public.handle_new_user CASCADE;
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, status, roles)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', 'Novo Usuário'),
    'client', 
    'active', 
    ARRAY['client']
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Cria o Gatilho (Trigger) para ativar a função acima
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- FIM DO SCRIPT
