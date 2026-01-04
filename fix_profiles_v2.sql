-- ====================================================
-- SCRIPT DE CORREÇÃO V2 (Com adição de colunas)
-- ====================================================

-- 1. ADICIONAR COLUNAS FALTANTES
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS roles text[] DEFAULT '{}';

-- 2. SINCRONIZAR USUÁRIOS
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

-- 3. ATUALIZAR FUNÇÃO AUTOMÁTICA
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

-- 4. ATUALIZAR TRIGGER
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
