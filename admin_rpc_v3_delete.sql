-- ====================================================
-- SCRIPT DE SUPER ADMIN V3 (FIX DELETE)
-- ====================================================

-- 1. Função de Exclusão Robusta (V2)
CREATE OR REPLACE FUNCTION admin_delete_user_v2(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Tenta excluir da tabela profiles primeiro (se existir)
  DELETE FROM public.profiles WHERE id = target_user_id;
  
  -- Exclui da tabela auth.users (Cascata deve cuidar do resto, mas garantimos)
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- 2. Limpeza de "Zumbis" (Usuários que foram deletados só do profile)
-- ATENÇÃO: Isso apaga usuários do Auth que NÃO têm profile.
-- Como acabamos de rodar o script de "recuperar profiles", quem está sem profile agora
-- é quem foi deletado intencionalmente pelo admin recentemente.
DELETE FROM auth.users
WHERE id NOT IN (SELECT id FROM public.profiles);
