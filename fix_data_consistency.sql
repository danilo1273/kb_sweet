
-- ====================================================
-- SCRIPT DE CORREÇÃO DE DADOS (DADOS FALTANTES)
-- ====================================================

-- 1. Tenta preencher o client_id nas movimentações financeiras
-- baseando-se na venda original (sales) se o link existir.
UPDATE financial_movements fm
SET client_id = s.client_id
FROM sales s
WHERE fm.related_sale_id = s.id
AND fm.client_id IS NULL;

-- 2. Garante que todas as colunas necessárias existam (redundância de segurança)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_movements' AND column_name = 'related_sale_id') THEN
        ALTER TABLE financial_movements ADD COLUMN related_sale_id uuid REFERENCES sales(id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'financial_movements' AND column_name = 'client_id') THEN
        ALTER TABLE financial_movements ADD COLUMN client_id uuid REFERENCES clients(id);
    END IF;
END $$;

-- 3. (Opcional) Tenta conectar financeiro perdido com vendas pelo ID na descrição (Caso extremo)
-- Ex: "Venda #123..."
-- (Desativado por padrão para evitar falsos positivos, descomente se necessário)
-- UPDATE financial_movements
-- SET related_sale_id = s.id, client_id = s.client_id
-- FROM sales s
-- WHERE description LIKE 'Venda #' || s.id || '%'
-- AND related_sale_id IS NULL;
