-- ============================================================
-- Planejamento no orçamento
-- ------------------------------------------------------------
-- As mesmas sete colunas que já existem em `projetos`, agora em
-- `orcamentos` — é no orçamento que o valor é montado, então é ali
-- que o planejamento passa a ser preenchido. Quando o orçamento é
-- aprovado e vira projeto, projeto-auto.ts copia estes valores para
-- as colunas planejado_* de `projetos`.
--
-- Anuláveis de propósito, sem DEFAULT 0: assim "nunca preenchido" é
-- diferente de "preenchido com zero". O aviso de sobrescrita do
-- projeto só dispara quando existe planejamento de verdade.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS planejado_custos             numeric,
  ADD COLUMN IF NOT EXISTS planejado_mo_pct             numeric,
  ADD COLUMN IF NOT EXISTS planejado_mt_pct             numeric,
  ADD COLUMN IF NOT EXISTS planejado_terceirizado_pct   numeric,
  ADD COLUMN IF NOT EXISTS planejado_administrativo_pct numeric,
  ADD COLUMN IF NOT EXISTS planejado_imposto_pct        numeric,
  ADD COLUMN IF NOT EXISTS planejado_lucro_pct          numeric;

COMMENT ON COLUMN public.orcamentos.planejado_custos IS
  'Custo previsto em R$. É a base sobre a qual os percentuais incidem (ver BASE_PERCENTUAIS em planejamento-execucao.ts).';
