-- ============================================================
-- Teste da entrega de EPIs para TODOS os funcionários — NÃO GRAVA NADA
-- ------------------------------------------------------------
-- Rode no SQL Editor do Supabase DEPOIS da migration
-- 20260924100000_epis_entrega_permissoes_e_rpc.sql.
--
-- Faz, como um usuário Administrador logado (papel `authenticated`,
-- com o auth.uid() dele — igual ao Portal):
--   1. leitura das tabelas do módulo;
--   2. para CADA funcionário cadastrado, uma entrega de 1 EPI (a CALÇA
--      GRD TAMANHO M, se existir) + 1 EPI com validade: confere número
--      do termo, itens gravados e validade calculada, e simula a
--      assinatura (PENDENTE -> ASSINADO) como o Portal faz;
--   3. uma entrega em lote com todos os funcionários de uma vez;
--   4. exclusão de um termo (lixeira);
--   5. que `anon` continua sem acesso.
--
-- O resultado aparece como ERRO de propósito: o bloco termina com
-- RAISE EXCEPTION, e é isso que garante que tudo é desfeito (termos,
-- itens, estoque e contador de número). Leia a mensagem: ela começa com
-- "RESULTADO DO TESTE".
-- ============================================================
DO $teste$
DECLARE
  v_admin      uuid;
  v_admin_nome text;
  v_calca      uuid;
  v_calca_nome text;
  v_com_val    uuid;
  v_val_dias   integer;
  v_hoje       date := current_date;
  v_itens      jsonb;
  v_ids        uuid[];
  v_nomes      text[];
  i            integer;
  v_total      integer := 0;
  v_ok         integer := 0;
  v_falhas     text[] := '{}';
  v_avisos     text[] := '{}';
  v_ent        public.entregas_epi;
  v_apagar     uuid;
  v_n          integer;
  v_val        date;
  v_lote       integer;
  v_dup        integer;
  v_privs      text := '';
BEGIN
  -- Quem "está logado": o Administrador (de preferência o Augusto).
  SELECT p.id, p.nome INTO v_admin, v_admin_nome
    FROM public.profiles p
   WHERE lower(btrim(coalesce(p.perfil, ''))) IN ('administrador', 'admin')
   ORDER BY (p.nome ILIKE '%augusto%') DESC, p.nome
   LIMIT 1;
  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'RESULTADO DO TESTE: nenhum perfil Administrador em profiles.';
  END IF;

  SELECT id, nome INTO v_calca, v_calca_nome FROM public.epis
   WHERE nome ILIKE '%CAL_A GRD%TAMANHO M%' ORDER BY ativo DESC, nome LIMIT 1;
  IF v_calca IS NULL THEN
    SELECT id, nome INTO v_calca, v_calca_nome FROM public.epis ORDER BY ativo DESC, nome LIMIT 1;
    v_avisos := v_avisos || ('CALÇA GRD TAMANHO M não achada; usei ' || coalesce(v_calca_nome, '(catálogo vazio)'));
  END IF;
  SELECT id, validade_dias INTO v_com_val, v_val_dias FROM public.epis
   WHERE coalesce(validade_dias, 0) > 0 ORDER BY ativo DESC, nome LIMIT 1;
  IF v_com_val IS NULL THEN
    v_avisos := v_avisos || 'NENHUM EPI tem validade de uso > 0 no catálogo: todo termo sai "sem validade"'::text;
  END IF;

  v_itens := jsonb_build_array(jsonb_build_object('epi_id', v_calca, 'quantidade', 1, 'motivo', 'PRIMEIRA ENTREGA'));
  IF v_com_val IS NOT NULL THEN
    v_itens := v_itens || jsonb_build_array(jsonb_build_object('epi_id', v_com_val, 'quantidade', 2, 'motivo', 'TROCA'));
  END IF;

  -- Lista completa lida como postgres, antes de trocar de papel: o teste
  -- cobre todo mundo, mesmo quem a RLS esconderia.
  SELECT array_agg(id ORDER BY nome), array_agg(nome ORDER BY nome)
    INTO v_ids, v_nomes FROM public.funcionarios;

  -- A partir daqui, o mesmo que o Portal: papel authenticated + JWT.
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', v_admin::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1) Leitura (o que a tela carrega).
  BEGIN
    PERFORM count(*) FROM public.funcionarios;
    PERFORM count(*) FROM public.epis;
    PERFORM count(*) FROM public.entregas_epi;
    PERFORM count(*) FROM public.entrega_epi_itens;
    PERFORM count(*) FROM public.compras_epi;
    PERFORM count(*) FROM public.compra_epi_itens;
  EXCEPTION WHEN others THEN
    v_falhas := v_falhas || ('LEITURA: ' || SQLERRM);
  END;
  IF NOT public.epis_tem_modulo() THEN
    v_falhas := v_falhas || (v_admin_nome || ' não tem o módulo de EPIs (epis_tem_modulo() = false)');
  END IF;

  -- 2) Um por um.
  FOR i IN 1 .. coalesce(array_length(v_ids, 1), 0) LOOP
    v_total := v_total + 1;
    BEGIN
      SELECT * INTO v_ent FROM public.epis_registrar_entregas(
        ARRAY[v_ids[i]], v_hoje, 'TESTE RESPONSÁVEL', 'ADMINISTRADOR', '', v_itens);

      IF v_ent.id IS NULL THEN RAISE EXCEPTION 'função não devolveu o termo'; END IF;
      IF v_ent.numero_termo !~ ('^EPI-' || extract(year FROM v_hoje) || '-\d{4,}$') THEN
        RAISE EXCEPTION 'número de termo fora do padrão: %', v_ent.numero_termo;
      END IF;
      IF v_ent.status <> 'PENDENTE' OR v_ent.assinado THEN
        RAISE EXCEPTION 'termo não nasceu PENDENTE';
      END IF;

      SELECT count(*) INTO v_n FROM public.entrega_epi_itens WHERE entrega_id = v_ent.id;
      IF v_n <> jsonb_array_length(v_itens) THEN
        RAISE EXCEPTION 'itens gravados: % (esperado %)', v_n, jsonb_array_length(v_itens);
      END IF;
      IF v_com_val IS NOT NULL THEN
        SELECT data_validade INTO v_val FROM public.entrega_epi_itens
         WHERE entrega_id = v_ent.id AND epi_id = v_com_val;
        IF v_val IS DISTINCT FROM v_hoje + v_val_dias THEN
          RAISE EXCEPTION 'validade %, esperada %', v_val, v_hoje + v_val_dias;
        END IF;
      END IF;

      -- Assinatura por foto (o UPDATE que o Portal faz depois do upload).
      UPDATE public.entregas_epi
         SET status = 'ASSINADO', assinado = true, data_assinatura = v_hoje,
             assinado_em = now(), assinado_por = v_admin,
             foto_recebimento_path = extract(year FROM v_hoje) || '/' || v_ent.numero_termo || '/foto.jpg',
             termo_pdf_path        = extract(year FROM v_hoje) || '/' || v_ent.numero_termo || '/termo.pdf'
       WHERE id = v_ent.id;
      GET DIAGNOSTICS v_n = ROW_COUNT;
      IF v_n <> 1 THEN RAISE EXCEPTION 'assinatura não gravou (RLS de UPDATE?)'; END IF;

      v_ok := v_ok + 1;
      v_apagar := v_ent.id;
    EXCEPTION WHEN others THEN
      v_falhas := v_falhas || (coalesce(v_nomes[i], '(sem nome)') || ': ' || SQLERRM || ' [' || SQLSTATE || ']');
    END;
  END LOOP;

  -- 3) Todos de uma vez.
  BEGIN
    SELECT count(*) INTO v_lote FROM public.epis_registrar_entregas(
      v_ids, v_hoje, 'TESTE LOTE', 'ADMINISTRADOR', 'ENTREGA EM LOTE', v_itens);
    IF v_lote <> coalesce(array_length(v_ids, 1), 0) THEN
      v_falhas := v_falhas || ('LOTE: ' || v_lote || ' termos para ' || array_length(v_ids, 1) || ' funcionários');
    END IF;
  EXCEPTION WHEN others THEN
    v_falhas := v_falhas || ('LOTE: ' || SQLERRM);
  END;

  SELECT count(*) INTO v_dup FROM (
    SELECT numero_termo FROM public.entregas_epi WHERE numero_termo <> ''
     GROUP BY 1 HAVING count(*) > 1) d;
  IF v_dup > 0 THEN v_falhas := v_falhas || (v_dup || ' número(s) de termo repetido(s)'); END IF;

  -- 4) Lixeira.
  BEGIN
    DELETE FROM public.entregas_epi WHERE id = v_apagar;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_apagar IS NOT NULL AND v_n <> 1 THEN v_falhas := v_falhas || 'EXCLUSÃO: termo não foi apagado'::text; END IF;
  EXCEPTION WHEN others THEN
    v_falhas := v_falhas || ('EXCLUSÃO: ' || SQLERRM);
  END;

  -- 5) anon continua de fora.
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN
    PERFORM 1 FROM public.funcionarios LIMIT 1;
    v_falhas := v_falhas || 'SEGURANÇA: anon conseguiu ler funcionarios'::text;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM 1 FROM public.entregas_epi LIMIT 1;
    v_falhas := v_falhas || 'SEGURANÇA: anon conseguiu ler entregas_epi'::text;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.epis_registrar_entregas(v_ids[1:1], v_hoje, '', '', '', v_itens);
    v_falhas := v_falhas || 'SEGURANÇA: anon conseguiu registrar entrega'::text;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  RAISE EXCEPTION '%', concat_ws(chr(10),
    'RESULTADO DO TESTE (nada foi gravado — rollback)',
    'Usuário simulado: ' || v_admin_nome,
    'EPI: ' || coalesce(v_calca_nome, '—'),
    format('Funcionários testados: %s | OK: %s | Falhas: %s',
           v_total, v_ok, coalesce(array_length(v_falhas, 1), 0)),
    'Avisos: ' || coalesce(nullif(array_to_string(v_avisos, chr(10) || '  '), ''), 'nenhum'),
    'Falhas: ' || coalesce(nullif(chr(10) || '  ' || array_to_string(v_falhas[1:60], chr(10) || '  '), chr(10) || '  '), 'nenhuma'));
END;
$teste$;
