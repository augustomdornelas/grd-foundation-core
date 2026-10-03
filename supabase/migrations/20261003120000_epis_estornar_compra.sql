-- ============================================================
-- EPIs — estornar compra
-- ------------------------------------------------------------
-- Compra não se exclui: ela gerou um lote (epi_lotes) por item e uma
-- ENTRADA_COMPRA em epi_movimentacoes, que é imutável. Estornar é tirar
-- do estoque o que ainda sobra de cada lote da compra, com AJUSTE_SAIDA.
--
-- estornar_compra_epi(p_compra_id, p_motivo):
--   * exige epi_pode_ajustar() (Administrador ou Almoxarifado) e motivo
--     com pelo menos 3 letras;
--   * trava a compra e os lotes (dois cliques não estornam duas vezes);
--   * para cada lote com compra_id = p_compra_id, saldo =
--     sum(epi_sinal(tipo) * quantidade); se > 0, lança AJUSTE_SAIDA do
--     saldo pela registrar_ajuste_epi — a mesma regra (e a mesma
--     atualização de epis.estoque) do ajuste manual;
--   * o que já saiu em entregas (SAIDA_ENTREGA - ESTORNO_ENTREGA -
--     DEVOLUCAO) não volta: está com os funcionários. A função devolve
--     quanto foi estornado e quanto ficou nas entregas;
--   * marca a compra como estornada (colunas novas abaixo).
-- Tudo numa transação: se um lote falhar, nada é lançado.
--
-- Idempotente na definição (CREATE OR REPLACE / IF NOT EXISTS).
-- ============================================================

BEGIN;

ALTER TABLE public.compras_epi
  ADD COLUMN IF NOT EXISTS estornada_em       timestamptz,
  ADD COLUMN IF NOT EXISTS estornada_por      uuid,
  ADD COLUMN IF NOT EXISTS estornada_por_nome text,
  ADD COLUMN IF NOT EXISTS estorno_motivo     text;

CREATE OR REPLACE FUNCTION public.estornar_compra_epi(p_compra_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_motivo        text := upper(btrim(coalesce(p_motivo, '')));
  v_compra        public.compras_epi%ROWTYPE;
  v_lote          record;
  v_saldo         numeric;
  v_em_entregas   numeric;
  v_comprado      numeric;
  v_total_estorno numeric := 0;
  v_total_entreg  numeric := 0;
  v_total_compra  numeric := 0;
  v_qtd_lotes     integer := 0;
  v_lotes         jsonb := '[]'::jsonb;
  v_nome          text;
BEGIN
  IF NOT public.epi_pode_ajustar() THEN
    RAISE EXCEPTION 'SEM PERMISSÃO: SÓ ADMINISTRADOR OU ALMOXARIFADO ESTORNA COMPRA'
      USING ERRCODE = '42501';
  END IF;

  IF length(regexp_replace(v_motivo, '[^[:alpha:]]', '', 'g')) < 3 THEN
    RAISE EXCEPTION 'INFORME O MOTIVO DO ESTORNO (MÍNIMO 3 LETRAS)'
      USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_compra FROM public.compras_epi WHERE id = p_compra_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMPRA NÃO ENCONTRADA' USING ERRCODE = 'P0002';
  END IF;
  IF v_compra.estornada_em IS NOT NULL THEN
    RAISE EXCEPTION 'ESTA COMPRA JÁ FOI ESTORNADA' USING ERRCODE = '22023';
  END IF;

  FOR v_lote IN
    SELECT l.id, l.epi_id, l.quantidade_comprada
      FROM public.epi_lotes l
     WHERE l.compra_id = p_compra_id
     ORDER BY l.created_at
       FOR UPDATE
  LOOP
    v_qtd_lotes := v_qtd_lotes + 1;

    SELECT coalesce(sum(public.epi_sinal(m.tipo) * m.quantidade), 0),
           coalesce(sum(CASE m.tipo
                          WHEN 'SAIDA_ENTREGA'   THEN  m.quantidade
                          WHEN 'ESTORNO_ENTREGA' THEN -m.quantidade
                          WHEN 'DEVOLUCAO'       THEN -m.quantidade
                          ELSE 0
                        END), 0)
      INTO v_saldo, v_em_entregas
      FROM public.epi_movimentacoes m
     WHERE m.lote_id = v_lote.id;

    v_comprado := coalesce(v_lote.quantidade_comprada, 0);
    v_em_entregas := greatest(v_em_entregas, 0);

    IF v_saldo > 0 THEN
      -- Passa como integer: int sobe sozinho para bigint/numeric, mas
      -- numeric não desce para integer na escolha da função.
      IF v_saldo <> trunc(v_saldo) THEN
        RAISE EXCEPTION 'LOTE % COM SALDO FRACIONADO (%); AJUSTE MANUALMENTE', v_lote.id, v_saldo;
      END IF;
      PERFORM public.registrar_ajuste_epi(
        p_lote_id     => v_lote.id,
        p_tipo        => 'AJUSTE_SAIDA',
        p_quantidade  => v_saldo::integer,
        p_motivo      => 'ESTORNO DA COMPRA ' || v_motivo,
        p_epi_id      => v_lote.epi_id,
        p_numero_ca   => NULL,
        p_validade_ca => NULL
      );
      v_total_estorno := v_total_estorno + v_saldo;
    END IF;

    v_total_entreg := v_total_entreg + v_em_entregas;
    v_total_compra := v_total_compra + v_comprado;
    v_lotes := v_lotes || jsonb_build_object(
      'lote_id',     v_lote.id,
      'epi_id',      v_lote.epi_id,
      'comprado',    v_comprado,
      'estornado',   greatest(v_saldo, 0),
      'em_entregas', v_em_entregas
    );
  END LOOP;

  IF v_qtd_lotes = 0 THEN
    RAISE EXCEPTION 'ESTA COMPRA NÃO TEM LOTE DE ESTOQUE; CORRIJA PELO AJUSTE DE ESTOQUE'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT nome INTO v_nome FROM public.profiles WHERE id = auth.uid();

  UPDATE public.compras_epi
     SET estornada_em       = now(),
         estornada_por      = auth.uid(),
         estornada_por_nome = v_nome,
         estorno_motivo     = v_motivo
   WHERE id = p_compra_id;

  RETURN jsonb_build_object(
    'compra_id',             p_compra_id,
    'lotes',                 v_lotes,
    'total_comprado',        v_total_compra,
    'total_estornado',       v_total_estorno,
    'unidades_em_entregas',  v_total_entreg
  );
END;
$$;

REVOKE ALL ON FUNCTION public.estornar_compra_epi(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estornar_compra_epi(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.estornar_compra_epi(uuid, text) TO authenticated;

COMMIT;
