-- ====================================================
-- SCRIPT DE LIBERAÇÃO DE SEGURANÇA (RLS) - KB SWEET
-- ====================================================

-- 1. Habilita segurança nível de linha (Boas práticas)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Remove políticas antigas que podem estar bloqueando
DROP POLICY IF EXISTS "Public profiles are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Enable read access for all users" ON public.profiles;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON public.profiles;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON public.profiles;

-- 3. CRIAR POLÍTICAS PERMISSIVAS (PARA O ALPHA 0.01)

-- Todos podem VER os perfis (Necessário para listar usuários)
CREATE POLICY "Enable read access for all users"
ON public.profiles FOR SELECT
USING (true);

-- Todos podem CRIAR seu próprio perfil (Necessário para novos cadastros)
CREATE POLICY "Enable insert for authenticated users only"
ON public.profiles FOR INSERT
WITH CHECK (auth.uid() = id);

-- ADMINS PODEM EDITAR TUDO
-- Para o Alpha, liberamos update para qualquer autenticado (o frontend protege a UI)
CREATE POLICY "Enable update for authenticated users"
ON public.profiles FOR UPDATE
USING (auth.role() = 'authenticated');
