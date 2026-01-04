-- ====================================================
-- SCRIPT DE MIGRACAO: MELHORIAS EM COMPRAS
-- ====================================================

-- 1. Melhorar Rastreamento de Quem Pediu
-- Adicionar user_id para permissão de edição segura
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. Motivo de Alteração (Quando o aprovador devolve)
ALTER TABLE public.purchase_requests ADD COLUMN IF NOT EXISTS change_reason TEXT;

-- 3. Atualizar Policies (Segurança)
-- Permitir que usuarios vejam tudo (simples) ou apenas seus (complexo). Por enquanto mantemos visibilidade geral.
-- Permitir update se for o dono E status pendente
CREATE POLICY "Users can update their own pending requests" ON public.purchase_requests
FOR UPDATE TO authenticated
USING (auth.uid() = user_id AND status = 'pending')
WITH CHECK (auth.uid() = user_id AND status = 'pending');

-- 4. Função para vincular user_id em registros antigos (Tentativa Opcional, baseada no email se tivessemos, mas não temos facil aqui. Deixa null pros antigos ou user atual)
-- Vamos deixar null para os antigos.
