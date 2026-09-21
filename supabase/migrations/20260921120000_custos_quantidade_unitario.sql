-- ============================================================
-- Custos: quantidade × valor unitário = valor total
-- ------------------------------------------------------------
-- Mesmo esquema das notas fiscais. `custos.valor` NÃO muda de
-- significado: continua sendo o total, e é ele que os somatórios e os
-- gráficos do projeto leem. Ele passa a ser calculado no Portal
-- (quantidade × valor_unitario) em vez de digitado.
--
-- As três colunas são NULLABLE e SEM DEFAULT: nenhuma linha existente é
-- tocada. Custo antigo fica com as três em NULL — "não informado", e não
-- "zero" — e a tela mostra "—".
--
-- A migration 20260819140000_custos_mao_de_obra.sql (funcao,
-- valor_diaria, quantidade_diarias e a tabela funcoes) NÃO foi aplicada
-- em produção (conferido em 21/09/2026) e continua de fora: esta não
-- depende dela.
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================
ALTER TABLE public.custos
  ADD COLUMN IF NOT EXISTS quantidade     numeric,
  ADD COLUMN IF NOT EXISTS valor_unitario numeric,
  ADD COLUMN IF NOT EXISTS unidade        text;

COMMENT ON COLUMN public.custos.quantidade IS
  'Quantidade lançada. NULL em custo antigo, lançado só com o total.';
COMMENT ON COLUMN public.custos.valor_unitario IS
  'Valor unitário em R$. valor = quantidade × valor_unitario (calculado no Portal). NULL em custo antigo.';
COMMENT ON COLUMN public.custos.unidade IS
  'Nome da unidade no momento do lançamento (snapshot, mesmo padrão de notas_fiscais.unidade). NULL em custo antigo.';
