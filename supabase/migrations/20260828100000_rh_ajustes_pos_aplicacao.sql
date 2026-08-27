-- ============================================================
-- RH — ajustes depois de aplicar e conferir a migration do módulo
-- ------------------------------------------------------------
-- Duas coisas: (1) revogar o acesso anônimo que o Supabase concede
-- sozinho a tabela nova, e (2) passar o cálculo do score da
-- candidatura para o banco.
--
-- (1) REVOKE DO ANON
-- ------------------------------------------------------------
-- Conferido no banco depois de aplicar a migration do módulo: todas
-- as tabelas rh_* respondem 42501 (permission denied) para `anon`,
-- MENOS rh_usuario_projetos e rh_sequencias, que responderam 200.
--
-- A causa é o ALTER DEFAULT PRIVILEGES do Supabase, que dá GRANT em
-- toda tabela nova do schema public para anon e authenticated. Nas
-- outras tabelas o REVOKE explícito da migration desfez isso; nestas
-- duas eu não escrevi o REVOKE.
--
-- Não houve vazamento: as duas estão com RLS ligado e nenhuma policy
-- alcança `anon`, então a leitura já voltava vazia. Isto aqui é a
-- segunda tranca — a que não depende de eu não ter errado a policy.
--
-- IDEMPOTENTE.
-- ============================================================

BEGIN;

REVOKE ALL ON public.rh_usuario_projetos FROM anon;
REVOKE ALL ON public.rh_sequencias       FROM anon;

-- Varredura: qualquer outra tabela rh_* que tenha nascido com GRANT
-- para anon perde o acesso aqui, inclusive as que vierem depois desta
-- migration se alguém esquecer o REVOKE de novo.
DO $blk$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relname LIKE 'rh\_%'
       AND has_table_privilege('anon', c.oid, 'SELECT')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', r.relname);
    RAISE NOTICE 'REVOKE aplicado em public.% (tinha SELECT para anon)', r.relname;
  END LOOP;
END;
$blk$;


-- ------------------------------------------------------------
-- (2) SCORE DA CANDIDATURA CALCULADO NO BANCO
-- ------------------------------------------------------------
-- O score é a média dos pareceres. Escrevê-lo pelo front não funciona:
-- quem registra parecer de entrevista técnica é o engenheiro da obra,
-- e a policy de UPDATE de rh_candidaturas exige RH ou Diretoria. O
-- update dele não daria erro — a RLS simplesmente não acharia a linha,
-- e o score ficaria desatualizado sem ninguém perceber.
--
-- Resolvido onde já moram os outros valores derivados do módulo
-- (quantidade_preenchida, data_ultima_movimentacao): numa trigger.
CREATE OR REPLACE FUNCTION public.tg_rh_score_candidatura()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_candidatura uuid;
  v_media       numeric;
BEGIN
  v_candidatura := CASE WHEN TG_OP = 'DELETE' THEN OLD.candidatura_id ELSE NEW.candidatura_id END;

  -- Só parecer de entrevista que aconteceu entra na conta. Agendada,
  -- cancelada e "não compareceu" não têm nota para dar.
  SELECT avg(a.nota_final) INTO v_media
    FROM public.rh_avaliacoes a
   WHERE a.candidatura_id = v_candidatura
     AND a.status = 'realizada'
     AND a.nota_final IS NOT NULL;

  UPDATE public.rh_candidaturas c
     SET score = CASE WHEN v_media IS NULL THEN NULL
                      ELSE greatest(0, least(100, round(v_media * 10)::int)) END
   WHERE c.id = v_candidatura;

  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_avaliacoes_score ON public.rh_avaliacoes;
CREATE TRIGGER trg_rh_avaliacoes_score
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_score_candidatura();

-- Backfill do que já existir.
UPDATE public.rh_candidaturas c
   SET score = t.score
  FROM (
    SELECT a.candidatura_id,
           greatest(0, least(100, round(avg(a.nota_final) * 10)::int)) AS score
      FROM public.rh_avaliacoes a
     WHERE a.status = 'realizada' AND a.nota_final IS NOT NULL
     GROUP BY a.candidatura_id
  ) t
 WHERE t.candidatura_id = c.id
   AND c.score IS DISTINCT FROM t.score;


-- ------------------------------------------------------------
-- (3) DUAS FUNÇÕES QUE ESTAVAM ABERTAS DEMAIS
-- ------------------------------------------------------------
-- Encontrado relendo a migration do módulo: as duas são SECURITY
-- DEFINER, têm EXECUTE para `authenticated` e não conferiam nada por
-- dentro. Ou seja: qualquer conta logada — inclusive perfil Campo, que
-- não vê RH — podia chamá-las.
--
--   rh_pendencias_alocacao(uuid)  devolvia, para um ID de funcionário
--     qualquer, a lista do que falta na documentação dele. É pouco,
--     mas é dado de pessoa e não devia sair para quem não é do RH.
--   rh_recalcula_aptidao_todos()  reescreve a situação de todos os
--     documentos. Recalcula sempre o mesmo valor a partir das datas,
--     então não corrompe nada — mas é escrita em massa e não é para
--     estar na mão de qualquer um.
--
-- O corpo das duas continua igual; só ganharam a guarda. O
-- almoxarifado entra na lista da primeira porque as triggers de
-- entrega de EPI passam por ela.
CREATE OR REPLACE FUNCTION public.rh_pendencias_alocacao(p_funcionario uuid)
RETURNS text[] LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_pend     text[] := '{}';
  v_situacao text;
  v_cargo    uuid;
  v_nrs      text[] := '{}';
  v_epis     uuid[] := '{}';
  r          record;
BEGIN
  IF NOT (public.rh_pode_ler() OR public.rh_e_almoxarifado() OR public.rh_e_gestor()) THEN
    RETURN ARRAY['Sem permissão para consultar aptidão'];
  END IF;

  SELECT f.situacao, f.cargo_id INTO v_situacao, v_cargo
    FROM public.funcionarios f WHERE f.id = p_funcionario;
  IF NOT FOUND THEN RETURN ARRAY['Colaborador não encontrado']; END IF;

  IF v_situacao = 'desligado' THEN
    v_pend := v_pend || 'Colaborador desligado';
  END IF;

  IF v_cargo IS NOT NULL THEN
    SELECT coalesce(c.nrs_exigidas, '{}'), coalesce(c.epis_padrao, '{}')
      INTO v_nrs, v_epis
      FROM public.rh_cargos c WHERE c.id = v_cargo;
  ELSE
    v_pend := v_pend || 'Cargo não definido na ficha';
  END IF;

  FOR r IN
    SELECT td.id, td.nome
      FROM public.rh_tipos_documento td
     WHERE td.ativo AND td.bloqueia_alocacao
       AND ((td.categoria = 'saude' AND td.obrigatorio_admissao)
            OR td.nome = ANY (v_nrs))
     ORDER BY td.ordem, td.nome
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.rh_funcionario_documentos d
       WHERE d.funcionario_id = p_funcionario
         AND d.tipo_documento_id = r.id
         AND d.ativo AND d.status <> 'substituido'
         AND (d.data_vencimento IS NULL OR d.data_vencimento >= CURRENT_DATE)
    ) THEN
      v_pend := v_pend || (r.nome || ' ausente ou vencido');
    END IF;
  END LOOP;

  IF array_length(v_epis, 1) IS NOT NULL THEN
    FOR r IN SELECT e.id, e.nome FROM public.epis e WHERE e.id = ANY (v_epis) LOOP
      IF NOT EXISTS (
        SELECT 1
          FROM public.entrega_epi_itens i
          JOIN public.entregas_epi en ON en.id = i.entrega_id
         WHERE en.funcionario_id = p_funcionario
           AND en.assinado
           AND i.epi_id = r.id
           AND (i.data_validade IS NULL OR i.data_validade >= CURRENT_DATE)
      ) THEN
        v_pend := v_pend || ('EPI ' || r.nome || ' sem entrega com termo assinado');
      END IF;
    END LOOP;
  END IF;

  RETURN v_pend;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_recalcula_aptidao_todos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n int := 0; r record;
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Recalcular a aptidão de toda a equipe é do RH ou da Diretoria.'
      USING ERRCODE = '42501';
  END IF;

  FOR r IN SELECT id FROM public.funcionarios WHERE ativo LOOP
    PERFORM public.rh_recalcula_aptidao(r.id);
    v_n := v_n + 1;
  END LOOP;

  UPDATE public.rh_funcionario_documentos d
     SET status = CASE
           WHEN d.data_vencimento IS NULL THEN 'valido'
           WHEN d.data_vencimento < CURRENT_DATE THEN 'vencido'
           WHEN d.data_vencimento <= CURRENT_DATE + 30 THEN 'a_vencer'
           ELSE 'valido' END
   WHERE d.ativo AND d.status <> 'substituido';
  RETURN v_n;
END;
$fn$;

COMMIT;
