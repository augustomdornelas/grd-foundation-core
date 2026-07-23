
-- Fator para converter custo_periodo em equivalente mensal
CREATE OR REPLACE FUNCTION public.fn_fator_mensal(unidade text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(coalesce(unidade,'dia')) LIKE 'mes%' OR lower(coalesce(unidade,'dia')) LIKE 'mês%' THEN 1
    WHEN lower(coalesce(unidade,'dia')) LIKE 'sem%' THEN 4.29
    ELSE 30
  END::numeric
$$;

-- Fator para diária equivalente
CREATE OR REPLACE FUNCTION public.fn_diaria_eq(custo numeric, unidade text) RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(custo,0) / CASE
    WHEN lower(coalesce(unidade,'dia')) LIKE 'mes%' OR lower(coalesce(unidade,'dia')) LIKE 'mês%' THEN 30
    WHEN lower(coalesce(unidade,'dia')) LIKE 'sem%' THEN 7
    ELSE 1
  END::numeric
$$;

-- Base por equipamento
CREATE OR REPLACE VIEW public.vw_equipamentos_base AS
SELECT
  e.id,
  e.codigo,
  e.nome,
  e.categoria,
  e.status,
  coalesce(e.valor,0)::numeric               AS valor,
  coalesce(e.custo_periodo,0)::numeric       AS custo_periodo,
  coalesce(e.unidade_periodo,'dia')          AS unidade_periodo,
  (coalesce(e.custo_periodo,0) * public.fn_fator_mensal(e.unidade_periodo))::numeric AS equiv_mensal,
  public.fn_diaria_eq(e.custo_periodo, e.unidade_periodo) AS diaria_eq,
  coalesce((SELECT SUM(emp.custo_total) FROM public.emprestimos emp WHERE emp.equipamento_id = e.id),0)::numeric AS receita_historica,
  (SELECT MIN(emp.data_inicio) FROM public.emprestimos emp WHERE emp.equipamento_id = e.id) AS primeira_locacao,
  coalesce((SELECT COUNT(*) FROM public.emprestimos emp WHERE emp.equipamento_id = e.id),0)::int AS locacoes_historico
FROM public.equipamentos e;

-- Payback / classificação
CREATE OR REPLACE VIEW public.vw_equipamento_payback AS
WITH base AS (
  SELECT
    b.*,
    GREATEST(1, CASE
      WHEN b.primeira_locacao IS NULL THEN 1
      ELSE (EXTRACT(YEAR FROM age(now(), b.primeira_locacao)) * 12
           + EXTRACT(MONTH FROM age(now(), b.primeira_locacao)))::int + 1
    END) AS meses_historico
  FROM public.vw_equipamentos_base b
)
SELECT
  id, codigo, nome, categoria, valor, receita_historica,
  CASE WHEN valor > 0 THEN LEAST(100, (receita_historica / valor) * 100) ELSE 0 END::numeric AS pct_recuperado,
  CASE WHEN meses_historico > 0 AND receita_historica > 0
       THEN valor / (receita_historica / meses_historico)
       ELSE 0 END::numeric AS payback_real_meses,
  CASE WHEN equiv_mensal > 0 THEN valor / equiv_mensal ELSE 0 END::numeric AS payback_teorico_meses,
  CASE
    WHEN receita_historica >= valor AND valor > 0 THEN 'PAGO'
    WHEN receita_historica <= 0 THEN 'CRÍTICO'
    WHEN (CASE WHEN receita_historica > 0 THEN valor / (receita_historica / meses_historico) ELSE 0 END) <= 30 THEN 'SAUDÁVEL'
    WHEN (CASE WHEN receita_historica > 0 THEN valor / (receita_historica / meses_historico) ELSE 0 END) <= 60 THEN 'ATENÇÃO'
    ELSE 'CRÍTICO'
  END AS classe
FROM base;

-- Detalhe de locações (uma linha por empréstimo)
CREATE OR REPLACE VIEW public.vw_locacoes_detalhe AS
SELECT
  emp.id,
  emp.equipamento_id,
  eq.nome        AS equipamento,
  eq.categoria   AS categoria,
  emp.destino    AS destino,
  emp.responsavel,
  emp.data_inicio,
  emp.data_devolucao_prevista,
  emp.data_devolucao_real,
  emp.custo_periodo,
  emp.unidade,
  public.fn_diaria_eq(emp.custo_periodo, emp.unidade) AS diaria_eq,
  GREATEST(0, (coalesce(emp.data_devolucao_real, CURRENT_DATE) - emp.data_inicio) + 1) AS dias_locacao,
  coalesce(emp.custo_total,0)::numeric AS receita_total,
  CASE
    WHEN emp.data_devolucao_real IS NOT NULL THEN 'DEVOLVIDO'
    WHEN emp.data_devolucao_prevista IS NOT NULL AND emp.data_devolucao_prevista < CURRENT_DATE THEN 'EM ATRASO'
    ELSE 'EM ABERTO'
  END AS status_locacao
FROM public.emprestimos emp
LEFT JOIN public.equipamentos eq ON eq.id = emp.equipamento_id;

-- Consolidado por destino
CREATE OR REPLACE VIEW public.vw_destino_locacoes AS
SELECT
  coalesce(NULLIF(TRIM(destino),''),'SEM DESTINO') AS destino,
  COUNT(*)::int                                    AS qtd_locacoes,
  COUNT(DISTINCT equipamento_id)::int              AS qtd_equipamentos,
  coalesce(SUM(dias_locacao),0)::int               AS total_dias,
  coalesce(SUM(receita_total),0)::numeric          AS receita,
  CASE WHEN COUNT(*) > 0 THEN coalesce(SUM(receita_total),0) / COUNT(*) ELSE 0 END::numeric AS ticket_medio,
  coalesce(AVG(dias_locacao) FILTER (WHERE data_devolucao_real IS NOT NULL),0)::numeric AS prazo_medio_dias,
  MIN(data_inicio)                                 AS primeira_locacao,
  MAX(coalesce(data_devolucao_real, data_devolucao_prevista, data_inicio)) AS ultima_movimentacao
FROM public.vw_locacoes_detalhe
GROUP BY 1;

-- Equipamentos ociosos (sem locação nos últimos 365 dias)
CREATE OR REPLACE VIEW public.vw_equipamentos_ociosos AS
SELECT
  b.id, b.codigo, b.nome, b.categoria, b.valor, b.custo_periodo, b.unidade_periodo,
  b.equiv_mensal AS custo_oportunidade_mensal,
  b.primeira_locacao,
  (SELECT MAX(data_devolucao_real) FROM public.emprestimos e WHERE e.equipamento_id = b.id) AS ultima_devolucao
FROM public.vw_equipamentos_base b
WHERE NOT EXISTS (
  SELECT 1 FROM public.emprestimos e
  WHERE e.equipamento_id = b.id
    AND coalesce(e.data_devolucao_real, e.data_inicio) >= (CURRENT_DATE - INTERVAL '365 days')
);

GRANT SELECT ON public.vw_equipamentos_base    TO authenticated, service_role;
GRANT SELECT ON public.vw_equipamento_payback  TO authenticated, service_role;
GRANT SELECT ON public.vw_locacoes_detalhe     TO authenticated, service_role;
GRANT SELECT ON public.vw_destino_locacoes     TO authenticated, service_role;
GRANT SELECT ON public.vw_equipamentos_ociosos TO authenticated, service_role;
