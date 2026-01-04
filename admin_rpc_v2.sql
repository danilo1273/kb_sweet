-- ====================================================
-- SCRIPT DE SUPER ADMIN V2 (GOD MODE COMPLETO)
-- ====================================================
-- 1. Sincronizar emails que estão vazios na tabela profiles
UPDATE public.profiles
SET email = auth.users.email
FROM auth.users
WHERE public.profiles.id = auth.users.id
AND (public.profiles.email IS NULL OR public.profiles.email = '');

-- 2. Função para atualizar TUDO (Email, Senha, Nome)
CREATE OR REPLACE FUNCTION admin_update_user_v2(
    target_user_id uuid,
    new_email text,
    new_password text,
    new_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- 1. Update Identity (Auth)
  -- Atualiza e confirma o email automaticamente para evitar bloqueio
  UPDATE auth.users
  SET 
    email = CASE WHEN new_email IS NOT NULL AND new_email <> '' THEN new_email ELSE email END,
    email_confirmed_at = now(), 
    encrypted_password = CASE WHEN new_password IS NOT NULL AND new_password <> '' THEN crypt(new_password, gen_salt('bf')) ELSE encrypted_password END,
    raw_user_meta_data = jsonb_set(COALESCE(raw_user_meta_data, '{}'::jsonb), '{full_name}', to_jsonb(new_name))
  WHERE id = target_user_id;

  -- 2. Update Profile (Public)
  -- Sincroniza as mudanças para a tabela pública
  UPDATE public.profiles
  SET
    email = CASE WHEN new_email IS NOT NULL AND new_email <> '' THEN new_email ELSE email END,
    full_name = new_name
  WHERE id = target_user_id;
END;
$$;
