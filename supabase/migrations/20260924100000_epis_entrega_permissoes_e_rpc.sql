-- ============================================================
-- EPIs — entrega volta a funcionar: permissões + registro atômico
-- ------------------------------------------------------------
-- SINTOMA (produção, 24/09/2026): "Salvar e gerar termo" falhava com
--   "permission denied for table entregas_epi" (42501)
-- para um Administrador logado.
--
-- CAUSA: 42501 "permission denied for TABLE" é falta de GRANT, não
-- RLS (RLS recusando dá "new row violates row-level security policy").
-- A requisição sai como `authenticated` — a lista de funcionários
-- carrega, e `anon` não lê mais essa tabela desde o módulo de RH —, e
-- no banco real o `authenticated` ficou sem INSERT em entregas_epi.
-- Nenhuma migration do repositório revoga isso; foi mudança feita
-- direto no banco. Por isso esta migration não supõe nada sobre o
-- estado atual: ela REDEFINE grants e policies das tabelas do módulo.
--
-- NÃO reaplica 20260808163000_epis_entrega_modulo.sql: aquela abre
-- leitura para `anon` (CPF/RG sem login). Aqui `anon` fica sem nada.
--
-- O QUE MUDA
--   1) Colunas que o fluxo usa (idempotente, caso alguma migration
--      anterior não tenha sido aplicada).
--   2) GRANTs: `authenticated` com SELECT/INSERT/UPDATE/DELETE nas
--      tabelas do módulo; `anon` e PUBLIC sem nada.
--   3) RLS de epis, entregas_epi, entrega_epi_itens, compras_epi e
--      compra_epi_itens: apaga TODAS as policies que existirem (inclusive
--      as criadas à mão, que não estão no repositório) e recria um
--      conjunto conhecido: ler = qualquer logado; escrever = quem tem o
--      módulo de EPIs (a mesma regra do bucket termos-epi).
--      `funcionarios` só ganha GRANT — as policies dela são do RH.
--   4) Numeração do termo no banco (EPI-<ano>-0001): contador por ano,
--      atômico, que nunca reaproveita número de termo excluído (a pasta
--      da foto no Storage é o número; reaproveitar misturaria termos).
--   5) epis_registrar_entregas(): grava a entrega de N funcionários
--      numa transação só — termos, itens (com snapshot e validade
--      calculada no banco) e baixa de estoque. Ou grava tudo, ou não
--      grava nada e diz qual funcionário falhou.
--   6) Gatilhos de aptidão do RH em entregas_epi/entrega_epi_itens não
--      derrubam mais a entrega: a aptidão é um cache (a verdade é
--      vw_rh_alocacao) e recalculá-la faz UPDATE em funcionarios, que
--      revalida funcionarios_cpf_check — um CPF antigo inválido fazia a
--      ASSINATURA falhar para aquele funcionário.
--   7) Funções e bucket do termo com foto (reaplicados, idempotentes).
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Colunas usadas pelo fluxo
-- ------------------------------------------------------------
ALTER TABLE public.entrega_epi_itens
  ADD COLUMN IF NOT EXISTS epi_foto_url text,
  ADD COLUMN IF NOT EXISTS fabricante   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unidade      text NOT NULL DEFAULT 'un';

ALTER TABLE public.entregas_epi
  ADD COLUMN IF NOT EXISTS foto_recebimento_path text,
  ADD COLUMN IF NOT EXISTS termo_pdf_path        text,
  ADD COLUMN IF NOT EXISTS assinado_em           timestamptz,
  ADD COLUMN IF NOT EXISTS assinado_por          uuid;

-- Índice único do número do termo. Se a base já tiver número repetido
-- o índice não nasce, mas a migration segue e avisa: o contador do
-- item 4 impede repetição daqui em diante de qualquer forma.
DO $blk$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_epi_numero_termo
    ON public.entregas_epi (numero_termo) WHERE numero_termo <> '';
EXCEPTION WHEN unique_violation THEN
  RAISE WARNING 'uq_entregas_epi_numero_termo NÃO foi criado: há numero_termo repetido em entregas_epi.';
END;
$blk$;

-- ------------------------------------------------------------
-- 2) Quem tem o módulo de EPIs (mesma regra do menu do Portal)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.epis_tem_modulo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(
    (
      SELECT CASE
        WHEN jsonb_typeof(p.permissoes::jsonb #> '{modulos,epis,ver}') = 'boolean'
          THEN (p.permissoes::jsonb #>> '{modulos,epis,ver}')::boolean
        ELSE lower(btrim(coalesce(p.perfil, ''))) IN
          ('administrador', 'admin', 'diretoria', 'almoxarifado')
      END
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$fn$;
REVOKE ALL ON FUNCTION public.epis_tem_modulo() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.epis_tem_modulo() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.epis_termo_aberto(p_caminho text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.entregas_epi e
    WHERE e.numero_termo = split_part(p_caminho, '/', 2)
      AND e.assinado
  );
$fn$;
REVOKE ALL ON FUNCTION public.epis_termo_aberto(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.epis_termo_aberto(text) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 3) GRANTs e RLS
-- ------------------------------------------------------------
-- funcionarios: o módulo de EPIs só lê; Colaboradores (RH) insere e
-- edita. Excluir não existe (quem sai é desligado), então sem DELETE.
REVOKE ALL ON public.funcionarios FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.funcionarios TO authenticated;
GRANT ALL ON public.funcionarios TO service_role;

DO $blk$
DECLARE
  t   text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'epis', 'entregas_epi', 'entrega_epi_itens', 'compras_epi', 'compra_epi_itens'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE WARNING 'Tabela public.% não existe — pulada.', t;
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE ALL ON public.%I FROM anon, PUBLIC', t);
    -- DELETE entra: a lixeira de entrega, de compra e de EPI usa.
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- Policy criada à mão (fora do repositório), inclusive RESTRICTIVE,
    -- também sai: o conjunto abaixo passa a ser o único.
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t);
      RAISE NOTICE 'policy removida: public.% -> "%"', t, pol.policyname;
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL)',
      t || ' leitura', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.epis_tem_modulo())',
      t || ' insercao', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.epis_tem_modulo()) WITH CHECK (public.epis_tem_modulo())',
      t || ' alteracao', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.epis_tem_modulo())',
      t || ' exclusao', t);
  END LOOP;
END;
$blk$;

-- ------------------------------------------------------------
-- 4) Numeração do termo
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epis_termo_sequencia (
  ano    integer PRIMARY KEY,
  ultimo integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.epis_termo_sequencia IS
  'Último número de termo de EPI emitido por ano. Só epis_proximo_numero_termo() mexe aqui.';
ALTER TABLE public.epis_termo_sequencia ENABLE ROW LEVEL SECURITY;
-- Sem policy e sem GRANT: ninguém lê nem escreve pela API.
REVOKE ALL ON public.epis_termo_sequencia FROM anon, authenticated, PUBLIC;
GRANT ALL ON public.epis_termo_sequencia TO service_role;

-- O ON CONFLICT trava a linha do ano: duas entregas simultâneas saem
-- com números seguidos, nunca iguais. O greatest() com o maior número
-- já gravado cobre termos lançados antes do contador existir.
CREATE OR REPLACE FUNCTION public.epis_proximo_numero_termo(p_ano integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_maior integer;
  v_seq   integer;
BEGIN
  SELECT coalesce(max((regexp_match(numero_termo, '^EPI-' || p_ano || '-(\d+)$'))[1]::integer), 0)
    INTO v_maior
    FROM public.entregas_epi
   WHERE numero_termo LIKE 'EPI-' || p_ano || '-%';

  INSERT INTO public.epis_termo_sequencia AS s (ano, ultimo)
  VALUES (p_ano, v_maior + 1)
  ON CONFLICT (ano) DO UPDATE SET ultimo = greatest(s.ultimo, v_maior) + 1
  RETURNING ultimo INTO v_seq;

  RETURN 'EPI-' || p_ano || '-' || lpad(v_seq::text, 4, '0');
END;
$fn$;
REVOKE ALL ON FUNCTION public.epis_proximo_numero_termo(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.epis_proximo_numero_termo(integer) TO service_role;

-- ------------------------------------------------------------
-- 5) Registro da entrega (um termo por funcionário, tudo ou nada)
-- ------------------------------------------------------------
-- p_itens: [{"epi_id": uuid, "quantidade": int >= 1, "motivo": text}]
--
-- SECURITY DEFINER com checagem explícita de epis_tem_modulo(): a
-- entrega não pode voltar a quebrar por um GRANT mexido à mão. Quem
-- não tem o módulo recebe 42501 com mensagem clara.
--
-- Os textos vão em maiúsculas, como o Portal grava (upperizePayload).
-- O snapshot do EPI (nome, CA, fabricante, unidade, foto) e a validade
-- (data de entrega + validade_dias; 0 = sem validade) saem do catálogo
-- aqui dentro, e não do navegador.
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
  v_func     uuid;
  v_nome     text;
  v_numero   text;
  v_entrega  public.entregas_epi;
  v_n_func   integer;
  v_item     jsonb;
  v_epi      uuid;
  v_qtd      numeric;
  v_motivo   text;
  v_ids      uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada: entre de novo no Portal.' USING ERRCODE = '42501';
  END IF;
  IF NOT public.epis_tem_modulo() THEN
    RAISE EXCEPTION 'Seu perfil não tem acesso ao módulo de EPIs.' USING ERRCODE = '42501';
  END IF;
  IF p_data_entrega IS NULL THEN
    RAISE EXCEPTION 'Informe a data de entrega.' USING ERRCODE = '22023';
  END IF;

  -- Sem repetidos, na ordem em que vieram.
  SELECT array_agg(f ORDER BY ord) INTO v_ids
    FROM (SELECT f, min(ord) AS ord
            FROM unnest(p_funcionarios) WITH ORDINALITY AS u(f, ord)
           WHERE f IS NOT NULL
           GROUP BY f) x;
  v_n_func := coalesce(array_length(v_ids, 1), 0);
  IF v_n_func = 0 THEN
    RAISE EXCEPTION 'Selecione ao menos um funcionário.' USING ERRCODE = '22023';
  END IF;

  IF p_itens IS NULL OR jsonb_typeof(p_itens) <> 'array' OR jsonb_array_length(p_itens) = 0 THEN
    RAISE EXCEPTION 'Adicione ao menos um EPI.' USING ERRCODE = '22023';
  END IF;

  -- Valida os itens uma vez, antes de gravar qualquer coisa.
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_itens) LOOP
    BEGIN
      v_epi := (v_item ->> 'epi_id')::uuid;
      v_qtd := (v_item ->> 'quantidade')::numeric;
    EXCEPTION WHEN others THEN
      RAISE EXCEPTION 'Item de EPI inválido: %', v_item::text USING ERRCODE = '22023';
    END;
    v_motivo := upper(btrim(coalesce(v_item ->> 'motivo', '')));
    IF v_epi IS NULL OR NOT EXISTS (SELECT 1 FROM public.epis e WHERE e.id = v_epi) THEN
      RAISE EXCEPTION 'EPI não encontrado no catálogo (id %).', coalesce(v_epi::text, 'vazio') USING ERRCODE = '22023';
    END IF;
    IF v_qtd IS NULL OR v_qtd < 1 OR v_qtd <> trunc(v_qtd) THEN
      RAISE EXCEPTION 'Quantidade inválida (%) — use um número inteiro a partir de 1.', coalesce(v_item ->> 'quantidade', 'vazia') USING ERRCODE = '22023';
    END IF;
    IF v_motivo NOT IN ('PRIMEIRA ENTREGA', 'TROCA', 'DANIFICADO', 'PERDA', 'VENCIMENTO') THEN
      RAISE EXCEPTION 'Motivo inválido: "%".', v_motivo USING ERRCODE = '22023';
    END IF;
  END LOOP;

  FOREACH v_func IN ARRAY v_ids LOOP
    SELECT f.nome INTO v_nome FROM public.funcionarios f WHERE f.id = v_func;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Funcionário não encontrado (id %). Nenhum termo foi gravado.', v_func USING ERRCODE = '22023';
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
        'PENDENTE', false,
        upper(btrim(coalesce(p_observacoes, '')))
      ) RETURNING * INTO v_entrega;

      INSERT INTO public.entrega_epi_itens (
        entrega_id, epi_id, epi_nome, ca, fabricante, unidade, epi_foto_url,
        quantidade, motivo, data_entrega, data_validade
      )
      SELECT v_entrega.id, e.id,
             upper(coalesce(e.nome, '')), upper(coalesce(e.ca, '')),
             upper(coalesce(e.fabricante, '')), upper(coalesce(nullif(btrim(e.unidade), ''), 'un')),
             nullif(btrim(e.foto_url), ''),
             (it.value ->> 'quantidade')::numeric::integer,
             upper(btrim(it.value ->> 'motivo')),
             p_data_entrega,
             CASE WHEN coalesce(e.validade_dias, 0) > 0
                  THEN p_data_entrega + e.validade_dias END
        FROM jsonb_array_elements(p_itens) WITH ORDINALITY AS it(value, ord)
        JOIN public.epis e ON e.id = (it.value ->> 'epi_id')::uuid
       ORDER BY it.ord;
    EXCEPTION WHEN others THEN
      -- Relança com o nome: a transação inteira é desfeita e a tela diz
      -- de quem foi o problema.
      RAISE EXCEPTION 'Erro na entrega de %: % (nenhum termo foi gravado)', v_nome, SQLERRM
        USING ERRCODE = SQLSTATE;
    END;

    RETURN NEXT v_entrega;
  END LOOP;

  -- Baixa de estoque somando todos os termos. Trava em zero, como antes:
  -- a contagem do almoxarifado pode estar atrasada e não pode impedir a
  -- entrega de um EPI que está na mão.
  UPDATE public.epis e
     SET estoque = greatest(0, e.estoque - x.total * v_n_func)
    FROM (SELECT (value ->> 'epi_id')::uuid AS epi_id,
                 sum((value ->> 'quantidade')::numeric)::integer AS total
            FROM jsonb_array_elements(p_itens)
           GROUP BY 1) x
   WHERE e.id = x.epi_id;

  RETURN;
END;
$fn$;
COMMENT ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) IS
  'Nova entrega de EPIs: um termo PENDENTE por funcionário, itens com snapshot e validade, baixa de estoque. Tudo ou nada.';
REVOKE ALL ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.epis_registrar_entregas(uuid[], date, text, text, text, jsonb) TO authenticated, service_role;

-- ------------------------------------------------------------
-- 6) Aptidão do RH não derruba entrega nem assinatura
-- ------------------------------------------------------------
-- Mesmos nomes das funções de 20260827160000_rh_modulo.sql (os
-- gatilhos já apontam para elas); só ganham o EXCEPTION.
DO $blk$
BEGIN
  IF to_regprocedure('public.rh_recalcula_aptidao(uuid)') IS NULL THEN
    RAISE NOTICE 'rh_recalcula_aptidao não existe — gatilhos de aptidão não alterados.';
    RETURN;
  END IF;

  EXECUTE $def$
    CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_entrega()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    BEGIN
      BEGIN
        PERFORM public.rh_recalcula_aptidao(
          CASE WHEN TG_OP = 'DELETE' THEN OLD.funcionario_id ELSE NEW.funcionario_id END);
      EXCEPTION WHEN others THEN
        RAISE WARNING 'aptidão não recalculada para %: %',
          CASE WHEN TG_OP = 'DELETE' THEN OLD.funcionario_id ELSE NEW.funcionario_id END, SQLERRM;
      END;
      RETURN NULL;
    END;
    $fn$
  $def$;

  EXECUTE $def$
    CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_entrega_item()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE v_func uuid;
    BEGIN
      SELECT en.funcionario_id INTO v_func FROM public.entregas_epi en
       WHERE en.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.entrega_id ELSE NEW.entrega_id END;
      IF v_func IS NOT NULL THEN
        BEGIN
          PERFORM public.rh_recalcula_aptidao(v_func);
        EXCEPTION WHEN others THEN
          RAISE WARNING 'aptidão não recalculada para %: %', v_func, SQLERRM;
        END;
      END IF;
      RETURN NULL;
    END;
    $fn$
  $def$;
END;
$blk$;

-- ------------------------------------------------------------
-- 7) Bucket privado termos-epi (foto + PDF do termo)
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('termos-epi', 'termos-epi', false, 10485760, ARRAY['image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "termos-epi leitura" ON storage.objects;
CREATE POLICY "termos-epi leitura" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'termos-epi' AND public.epis_tem_modulo());

DROP POLICY IF EXISTS "termos-epi envio" ON storage.objects;
CREATE POLICY "termos-epi envio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  );

DROP POLICY IF EXISTS "termos-epi reenvio" ON storage.objects;
CREATE POLICY "termos-epi reenvio" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  )
  WITH CHECK (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  );

-- Sem policy de DELETE: nenhum usuário apaga foto nem termo.
DROP POLICY IF EXISTS "termos-epi exclusao" ON storage.objects;

COMMIT;

-- PostgREST enxergar a função nova sem esperar o cache expirar.
NOTIFY pgrst, 'reload schema';
