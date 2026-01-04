-- ====================================================
-- SCRIPT DE SUPER ADMIN (GOD MODE)
-- ====================================================
-- Este script cria funções poderosas para você gerenciar usuários.
-- ATENÇÃO: Dá poder para resetar senhas e apagar contas.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Função para alterar senha de QUALQUER usuário
CREATE OR REPLACE FUNCTION admin_update_password(target_user_id uuid, new_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER -- Roda com permissões de superusuário
AS $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt(new_password, gen_salt('bf'))
  WHERE id = target_user_id;
END;
$$;

-- 2. Função para EXCLUIR usuário definitivamente (Auth + Perfil)
CREATE OR REPLACE FUNCTION admin_delete_user(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Apaga do Auth (Login)
  DELETE FROM auth.users WHERE id = target_user_id;
  -- O perfil deve sumir via Cascade, mas garantimos:
  DELETE FROM public.profiles WHERE id = target_user_id;
END;
$$;
