-- ============================================================
-- EPIs — entrega passa a dar baixa pelo LIVRO DE ESTOQUE (por lote)
-- ------------------------------------------------------------
-- SINTOMA (03/10/2026): "Nenhum termo foi gravado: O ESTOQUE NÃO PODE
-- SER ALTERADO DIRETAMENTE. USE COMPRA, ENTREGA OU AJUSTE DE ESTOQUE."
--
-- CAUSA: o banco tem um controle de estoque por lote (epi_lotes +
-- epi_movimentacoes). O saldo de epis.estoque é recalculado pelo
-- gatilho de epi_movimentacoes, e trg_epis_estoque_protegido bloqueia
-- qualquer UPDATE direto. A versão de epis_registrar_entregas da
-- migration 20260924100000 dava baixa com UPDATE direto — barrado.
--
-- O QUE MUDA: só a função epis_registrar_entregas (mesma assinatura,
-- o Portal não precisa mudar). Para cada item:
--   - usa o lote informado em "lote_id", se vier; senão escolhe sozinha
--     o lote ativo com saldo suficiente e C.A. válido (exige_ca),
--     começando pelo C.A. que vence primeiro;
--   - grava o item com lote, C.A. e validade do C.A. do lote;
--   - registra a movimentação SAIDA_ENTREGA (o gatilho do livro confere
--     saldo e C.A. e atualiza epis.estoque).
-- Continua tudo ou nada: se um funcionário/item falhar, nenhum termo
-- é gravado, e a mensagem diz quem e por quê.
--
-- Compatível com cancelar_entrega_epi, registrar_devolucao_epi e
-- epi_item_em_posse, que já leem o lote pela SAIDA_ENTREGA.
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.epis_registrar_entregas(
  p_funcionarios      uuid[],
  p_data_entrega      date,
  p_responsavel       text,
  p_responsavel_cargo text,
  p_observacoes       text,
  p_itens             jsonb
) RETURNS SETOF public.entregas_epi
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_func        uuid;
  v_nome        text;
  v_numero      text;
  v_entrega     public.entregas_epi;
  v_n_func      integer;
  v_item        jsonb;
  v_epi         uuid;
  v_qtd         numeric;
  v_motivo      text;
  v_ids         uuid[];
  v_obs         text;
  v_e           public.epis%ROWTYPE;
  v_lote        public.epi_lotes%ROWTYPE;
  v_lote_pedido uuid;
  v_item_id     uuid;
  v_ca_item     text;
  v_saldo_total numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'SESSÃO EXPIRADA: ENTRE DE NOVO NO PORTAL.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.epis_tem_modulo() THEN
    RAISE EXCEPTION 'SEU PERFIL NÃO TEM ACESSO AO MÓDULO DE EPIS.' USING ERRCODE = '42501';
  END IF;
  IF p_data_entrega IS NULL THEN
    RAISE EXCEPTION 'INFORME A DATA DE ENTREGA.' USING ERRCODE = '22023';
  END IF;

  -- Funcionários sem repetidos, na ordem em que vieram.
  SELECT array_agg(f ORDER BY ord) INTO v_ids
    FROM (SELECT f, min(ord) AS ord
            FROM unnest(p_funcionarios) WITH ORDINALITY AS u(f, ord)
           WHERE f IS NOT NULL
           GROUP BY f) x;
  v_n_func := coalesce(array_length(v_ids, 1), 0);
  IF v_n_func = 0 THEN
    RAISE EXCEPTION 'SELECIONE AO MENOS UM FUNCIONÁRIO.' USING ERRCODE = '22023';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'ADICIONE AO MENOS UM EPI.' USING ERRCODE = '22023';
  END IF;

  -- Valida os itens antes de gravar qualquer coisa.
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) LOOP
    BEGIN
      v_epi := (v_item ->> 'epi_id')::uuid;
      v_qtd := (v_item ->> 'quantidade')::numeric;
      v_lote_pedido := nullif(v_item ->> 'lote_id', '')::uuid;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'ITEM DE EPI INVÁLIDO: %', v_item::text USING ERRCODE = '22023';
    END;
    v_motivo := upper(btrim(coalesce(v_item ->> 'motivo', '')));
    IF v_epi IS NULL OR NOT EXISTS (SELECT 1 FROM public.epis e WHERE e.id = v_epi) THEN
      RAISE EXCEPTION 'EPI NÃO ENCONTRADO NO CATÁLOGO (ID %).', coalesce(v_epi::text, 'VAZIO') USING ERRCODE = '22023';
    END IF;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd <> trunc(v_qtd) THEN
      RAISE EXCEPTION 'QUANTIDADE INVÁLIDA (%) — USE UM NÚMERO INTEIRO A PARTIR DE 1.', coalesce(v_item ->> 'quantidade', 'VAZIA') USING ERRCODE = '22023';
    END IF;
    IF v_motivo NOT IN ('PRIMEIRA ENTREGA', 'TROCA', 'DANIFICADO', 'PERDA', 'VENCIMENTO') THEN
      RAISE EXCEPTION 'MOTIVO INVÁLIDO: "%".', v_motivo USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_obs := upper(btrim(coalesce(p_observacoes, '')));

  FOREACH v_func IN ARRAY v_ids LOOP
    SELECT f.nome INTO v_nome FROM public.funcionarios f WHERE f.id = v_func;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'FUNCIONÁRIO NÃO ENCONTRADO (ID %).', v_func USING ERRCODE = '22023';
    END IF;

    BEGIN
      v_numero := public.epis_proximo_numero_termo(extract(year FROM p_data_entrega)::integer);

      INSERT INTO public.entregas_epi (
        funcionario_id, numero_termo, data_entrega, responsavel_entrega,
        responsavel_cargo, status, assinado, observacoes
      ) VALUES (
        v_func, v_numero, p_data_entrega,
        upper(btrim(coalesce(p_responsavel, ''))),
        upper(btrim(coalesce(p_responsavel_cargo, ''))),
        'PENDENTE', false, v_obs
      ) RETURNING * INTO v_entrega;

      FOR v_item IN SELECT value FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS it(value, ord) ORDER BY ord LOOP
        SELECT * INTO v_e FROM public.epis WHERE id = (v_item ->> 'epi_id')::uuid;
        v_qtd         := (v_item ->> 'quantidade')::numeric;
        v_motivo      := upper(btrim(v_item ->> 'motivo'));
        v_lote_pedido := nullif(v_item ->> 'lote_id', '')::uuid;

        IF v_lote_pedido IS NOT NULL THEN
          SELECT * INTO v_lote FROM public.epi_lotes WHERE id = v_lote_pedido;
          IF NOT FOUND OR v_lote.epi_id <> v_e.id THEN
            RAISE EXCEPTION 'O LOTE ESCOLHIDO NÃO É DE %', upper(v_e.nome);
          END IF;
        ELSE
          -- Lote automático: ativo, com saldo para a quantidade e, se o EPI
          -- exige C.A., com C.A. preenchido e válido na data da entrega.
          SELECT l.* INTO v_lote
            FROM public.epi_lotes l
           WHERE l.epi_id = v_e.id
             AND l.ativo
             AND (NOT coalesce(v_e.exige_ca, false)
                  OR (NOT public.epi_ca_pendente(l.numero_ca, l.validade_ca)
                      AND l.validade_ca >= p_data_entrega))
             AND (SELECT coalesce(sum(public.epi_sinal(m.tipo) * m.quantidade), 0)
                    FROM public.epi_movimentacoes m
                   WHERE m.lote_id = l.id) >= v_qtd
           ORDER BY l.validade_ca NULLS LAST, l.created_at
           LIMIT 1;

          IF NOT FOUND THEN
            SELECT coalesce(sum(public.epi_sinal(m.tipo) * m.quantidade), 0) INTO v_saldo_total
              FROM public.epi_movimentacoes m WHERE m.epi_id = v_e.id;
            RAISE EXCEPTION 'SEM LOTE DISPONÍVEL DE % PARA % UN. (ESTOQUE TOTAL: %). LANCE A COMPRA OU UM AJUSTE DE ENTRADA, OU REVISE O C.A. DO LOTE.',
              upper(v_e.nome), v_qtd, v_saldo_total;
          END IF;
        END IF;

        v_ca_item := CASE WHEN btrim(coalesce(v_lote.numero_ca, '')) IN ('', 'SEM CA - REVISAR')
                          THEN NULL ELSE v_lote.numero_ca END;

        INSERT INTO public.entrega_epi_itens (
          entrega_id, epi_id, epi_nome, ca, fabricante, unidade, epi_foto_url,
          quantidade, motivo, data_entrega, data_validade,
          lote_id, numero_ca, validade_ca
        ) VALUES (
          v_entrega.id, v_e.id,
          upper(coalesce(v_e.nome, '')),
          upper(coalesce(v_ca_item, '')),
          upper(coalesce(v_e.fabricante, '')),
          upper(coalesce(nullif(btrim(v_e.unidade), ''), 'un')),
          nullif(btrim(v_e.foto_url), ''),
          v_qtd::integer, v_motivo, p_data_entrega,
          CASE WHEN coalesce(v_e.validade_dias, 0) > 0 THEN p_data_entrega + v_e.validade_dias END,
          v_lote.id, v_ca_item, v_lote.validade_ca
        ) RETURNING id INTO v_item_id;

        -- O gatilho do livro confere saldo e C.A. e atualiza epis.estoque.
        INSERT INTO public.epi_movimentacoes (
          epi_id, lote_id, tipo, quantidade, data, entrega_id, entrega_item_id, motivo, observacoes
        ) VALUES (
          v_e.id, v_lote.id, 'SAIDA_ENTREGA', v_qtd, p_data_entrega, v_entrega.id, v_item_id, v_motivo, v_obs
        );
      END LOOP;
    EXCEPTION WHEN others THEN
      -- Desfaz tudo e diz de quem foi o problema.
      RAISE EXCEPTION 'ERRO NA ENTREGA DE %: % (NENHUM TERMO FOI GRAVADO)', v_nome, SQLERRM
        USING ERRCODE = SQLSTATE;
    END;

    RETURN NEXT v_entrega;
  END LOOP;

  RETURN;
END;
$fn$;

COMMENT ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) IS
  'Nova entrega de EPIs: um termo PENDENTE por funcionário, itens com lote/C.A./validade e baixa pelo livro (SAIDA_ENTREGA). Tudo ou nada.';
REVOKE ALL ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) TO authenticated, service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';
