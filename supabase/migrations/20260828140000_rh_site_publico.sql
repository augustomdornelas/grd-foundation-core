-- ============================================================
-- RH — inscrição pelo site e área do candidato (Etapa 4)
-- ------------------------------------------------------------
-- O site é a única parte do módulo que fala com o banco SEM login.
-- Por isso `anon` não ganha permissão em tabela nenhuma: ele chama
-- uma função só, rh_inscricao_publica(), que valida tudo e escreve
-- por dentro. A superfície exposta à internet é uma função com
-- assinatura fixa, não um INSERT livre.
--
-- E o candidato logado nunca enxerga tabela de recrutamento: ele lê a
-- view vw_rh_minhas_candidaturas, que não tem score, nem parecer, nem
-- motivo de reprovação. Reprovado vê "processo encerrado" — a
-- justificativa interna não sai do RH nem por engano de tela, porque
-- a coluna não está na view.
--
-- IDEMPOTENTE.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Marca de "operação do sistema"
-- ------------------------------------------------------------
-- Irmã de rh_em_movimentacao(), com propósito diferente: aquela
-- libera mudança de etapa/status; esta libera as funções internas a
-- escrever campos que o candidato não pode mexer sozinho (CPF, LGPD,
-- status). Duas marcas separadas para que uma não vire chave-mestra
-- da outra.
CREATE OR REPLACE FUNCTION public.rh_em_operacao_sistema()
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(current_setting('rh.sistema', true), 'off') = 'on';
$fn$;

-- ------------------------------------------------------------
-- 2) O candidato edita os dados dele, mas não todos
-- ------------------------------------------------------------
-- A policy de UPDATE de rh_candidatos deixa o próprio candidato
-- alterar a linha dele — o que é certo para telefone e endereço, e
-- errado para status, CPF e consentimento de LGPD. Sem esta trigger,
-- um candidato poderia se marcar como "contratado".
CREATE OR REPLACE FUNCTION public.tg_rh_candidato_protege()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF public.rh_pode_editar() OR public.rh_em_operacao_sistema() THEN
    RETURN NEW;
  END IF;

  -- Chegou aqui: é o próprio candidato mexendo na ficha dele.
  NEW.cpf                := OLD.cpf;
  NEW.status             := OLD.status;
  NEW.origem             := OLD.origem;
  NEW.funcionario_id     := OLD.funcionario_id;
  NEW.ativo              := OLD.ativo;
  NEW.auth_user_id       := OLD.auth_user_id;
  NEW.lgpd_consentimento := OLD.lgpd_consentimento;
  NEW.lgpd_data          := OLD.lgpd_data;
  NEW.lgpd_retencao_ate  := OLD.lgpd_retencao_ate;
  NEW.anonimizado_em     := OLD.anonimizado_em;
  NEW.observacoes        := OLD.observacoes;   -- campo do RH, não do candidato
  NEW.curriculo_path     := coalesce(NEW.curriculo_path, OLD.curriculo_path);
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_candidatos_protege ON public.rh_candidatos;
CREATE TRIGGER trg_rh_candidatos_protege
  BEFORE UPDATE ON public.rh_candidatos
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_candidato_protege();

-- ------------------------------------------------------------
-- 3) Inscrição pelo site — a única porta aberta para `anon`
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rh_inscricao_publica(
  p_nome              text,
  p_cpf               text,
  p_email             text,
  p_telefone          text,
  p_cidade            text,
  p_uf                text,
  p_cargo_pretendido  text,
  p_lgpd              boolean,
  p_vaga_slug         text DEFAULT NULL,
  p_whatsapp          text DEFAULT '',
  p_disponibilidade   text DEFAULT 'a_combinar',
  p_nrs               jsonb DEFAULT '[]'::jsonb,
  p_curriculo_path    text DEFAULT NULL,
  p_experiencia       text DEFAULT '',
  p_origem_detalhe    text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cpf         text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  v_vaga        public.rh_vagas;
  v_candidato   public.rh_candidatos;
  v_candidato_id uuid;
  v_etapa       uuid;
  v_candidatura uuid;
  v_ja          boolean := false;
  v_recentes    int;
BEGIN
  -- ---------- Validações ----------
  IF p_lgpd IS NOT TRUE THEN
    RAISE EXCEPTION 'É preciso aceitar o aviso de privacidade para se candidatar.' USING ERRCODE = '23514';
  END IF;
  IF char_length(btrim(coalesce(p_nome, ''))) < 3 THEN
    RAISE EXCEPTION 'Informe o nome completo.' USING ERRCODE = '23514';
  END IF;
  IF length(v_cpf) <> 11 OR NOT public.rh_cpf_valido(v_cpf) THEN
    RAISE EXCEPTION 'CPF inválido. Confira os números.' USING ERRCODE = '23514';
  END IF;
  IF btrim(coalesce(p_email, '')) = '' AND btrim(coalesce(p_telefone, '')) = '' THEN
    RAISE EXCEPTION 'Informe ao menos um e-mail ou um telefone para contato.' USING ERRCODE = '23514';
  END IF;
  IF p_disponibilidade NOT IN ('imediata', '15_dias', '30_dias', 'a_combinar') THEN
    RAISE EXCEPTION 'Disponibilidade inválida.' USING ERRCODE = '23514';
  END IF;
  -- O currículo só pode vir da pasta pública do bucket; qualquer outro
  -- caminho seria o formulário apontando para arquivo de terceiro.
  IF p_curriculo_path IS NOT NULL AND p_curriculo_path NOT LIKE 'publico/%' THEN
    RAISE EXCEPTION 'Caminho de currículo inválido.' USING ERRCODE = '23514';
  END IF;

  -- ---------- Vaga (quando a inscrição é para uma vaga) ----------
  IF p_vaga_slug IS NOT NULL AND btrim(p_vaga_slug) <> '' THEN
    SELECT * INTO v_vaga FROM public.rh_vagas
     WHERE slug = p_vaga_slug AND publicada_site AND status = 'publicada' AND ativo;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Esta vaga não está mais aberta.' USING ERRCODE = 'P0002';
    END IF;
  END IF;

  PERFORM set_config('rh.sistema', 'on', true);

  -- ---------- Candidato: acha pelo CPF ou cria ----------
  SELECT * INTO v_candidato FROM public.rh_candidatos
   WHERE regexp_replace(cpf, '[^0-9]', '', 'g') = v_cpf AND cpf <> '';

  IF FOUND THEN
    v_candidato_id := v_candidato.id;

    -- Freio de spam sem depender de IP: cinco inscrições por hora, por
    -- CPF, já é mais do que qualquer pessoa faz de verdade.
    SELECT count(*) INTO v_recentes FROM public.rh_candidaturas
     WHERE candidato_id = v_candidato_id AND created_at > now() - interval '1 hour';
    IF v_recentes >= 5 THEN
      RAISE EXCEPTION 'Muitas inscrições seguidas. Tente de novo daqui a pouco.' USING ERRCODE = '53400';
    END IF;

    -- Candidato anonimizado não volta pela porta do site: seria
    -- desfazer um pedido de exclusão de LGPD sem o RH saber.
    IF v_candidato.anonimizado_em IS NOT NULL THEN
      RAISE EXCEPTION 'Este cadastro foi excluído a pedido. Fale com o RH para se candidatar de novo.'
        USING ERRCODE = '42501';
    END IF;

    UPDATE public.rh_candidatos SET
      nome               = btrim(p_nome),
      email              = lower(btrim(coalesce(p_email, email))),
      telefone           = coalesce(nullif(btrim(p_telefone), ''), telefone),
      whatsapp           = coalesce(nullif(btrim(p_whatsapp), ''), whatsapp),
      cidade             = coalesce(nullif(btrim(p_cidade), ''), cidade),
      uf                 = coalesce(nullif(upper(btrim(p_uf)), ''), uf),
      cargo_pretendido   = coalesce(nullif(btrim(p_cargo_pretendido), ''), cargo_pretendido),
      disponibilidade    = p_disponibilidade,
      nrs_declaradas     = CASE WHEN jsonb_array_length(coalesce(p_nrs, '[]'::jsonb)) > 0
                                THEN p_nrs ELSE nrs_declaradas END,
      experiencia_resumo = coalesce(nullif(btrim(p_experiencia), ''), experiencia_resumo),
      curriculo_path     = coalesce(p_curriculo_path, curriculo_path),
      -- Reconsentiu agora: a contagem dos 24 meses recomeça.
      lgpd_consentimento = true,
      lgpd_data          = now(),
      lgpd_retencao_ate  = (CURRENT_DATE + interval '24 months')::date,
      status             = CASE WHEN status IN ('descartado', 'nao_disponivel', 'banco_talentos')
                                THEN 'ativo' ELSE status END
    WHERE id = v_candidato_id;
  ELSE
    INSERT INTO public.rh_candidatos (
      nome, cpf, email, telefone, whatsapp, cidade, uf, cargo_pretendido,
      disponibilidade, nrs_declaradas, experiencia_resumo, curriculo_path,
      origem, origem_detalhe, status,
      lgpd_consentimento, lgpd_data, lgpd_retencao_ate
    ) VALUES (
      btrim(p_nome), v_cpf, lower(btrim(coalesce(p_email, ''))), btrim(coalesce(p_telefone, '')),
      btrim(coalesce(p_whatsapp, '')), btrim(coalesce(p_cidade, '')), upper(btrim(coalesce(p_uf, ''))),
      btrim(coalesce(p_cargo_pretendido, '')), p_disponibilidade, coalesce(p_nrs, '[]'::jsonb),
      btrim(coalesce(p_experiencia, '')), p_curriculo_path,
      'site', btrim(coalesce(p_origem_detalhe, '')),
      CASE WHEN p_vaga_slug IS NULL THEN 'banco_talentos' ELSE 'em_processo' END,
      true, now(), (CURRENT_DATE + interval '24 months')::date
    ) RETURNING id INTO v_candidato_id;
  END IF;

  -- ---------- Candidatura ----------
  IF v_vaga.id IS NOT NULL THEN
    SELECT id INTO v_candidatura FROM public.rh_candidaturas
     WHERE candidato_id = v_candidato_id AND vaga_id = v_vaga.id;

    IF v_candidatura IS NOT NULL THEN
      v_ja := true;
    ELSE
      SELECT id INTO v_etapa FROM public.rh_funil_etapas
       WHERE ativo AND tipo = 'inicial' ORDER BY ordem LIMIT 1;
      IF v_etapa IS NULL THEN
        RAISE EXCEPTION 'O funil de seleção não está configurado. Fale com o RH.' USING ERRCODE = 'P0002';
      END IF;

      PERFORM set_config('rh.movimentacao', 'on', true);
      INSERT INTO public.rh_candidaturas (candidato_id, vaga_id, etapa_id, origem)
      VALUES (v_candidato_id, v_vaga.id, v_etapa, 'site')
      RETURNING id INTO v_candidatura;

      INSERT INTO public.rh_candidatura_historico
        (candidatura_id, etapa_nova_id, status_anterior, status_novo, nota, autor_nome)
      VALUES (v_candidatura, v_etapa, '', 'em_andamento',
              'Inscrição feita pelo próprio candidato no site.', 'Site');
      PERFORM set_config('rh.movimentacao', 'off', true);

      UPDATE public.rh_candidatos SET status = 'em_processo'
       WHERE id = v_candidato_id AND status IN ('ativo', 'banco_talentos');
    END IF;
  END IF;

  PERFORM set_config('rh.sistema', 'off', true);

  RETURN jsonb_build_object(
    'ok', true,
    'candidato_id', v_candidato_id,
    'candidatura_id', v_candidatura,
    'ja_inscrito', v_ja,
    'email', lower(btrim(coalesce(p_email, '')))
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.rh_inscricao_publica(text, text, text, text, text, text, text, boolean, text, text, text, jsonb, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rh_inscricao_publica(text, text, text, text, text, text, text, boolean, text, text, text, jsonb, text, text, text)
  TO anon, authenticated, service_role;

-- ------------------------------------------------------------
-- 4) Envio de currículo sem login
-- ------------------------------------------------------------
-- `anon` escreve só dentro de curriculos/publico/, e nunca lê: a
-- policy de SELECT do bucket continua exigindo login. Quem envia o
-- arquivo não consegue baixar o de mais ninguém.
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY[
         'application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'image/jpeg',
         'image/png'
       ]
 WHERE id = 'curriculos';

DROP POLICY IF EXISTS "curriculos envio publico" ON storage.objects;
CREATE POLICY "curriculos envio publico" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'curriculos' AND (storage.foldername(name))[1] = 'publico');

-- ------------------------------------------------------------
-- 5) Área do candidato
-- ------------------------------------------------------------
-- Liga o login (magic link) ao cadastro que já existe, pelo e-mail.
-- Só pega cadastro que ainda não tem dono, e um por vez.
CREATE OR REPLACE FUNCTION public.rh_vincular_candidato()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_email text;
  v_id    uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sem sessão.' USING ERRCODE = '42501';
  END IF;

  SELECT id INTO v_id FROM public.rh_candidatos WHERE auth_user_id = auth.uid() LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  SELECT lower(u.email) INTO v_email FROM auth.users u WHERE u.id = auth.uid();
  IF v_email IS NULL OR v_email = '' THEN RETURN NULL; END IF;

  -- LIMIT 1 na subconsulta: dois cadastros com o mesmo e-mail não
  -- podem virar dois donos do mesmo login.
  PERFORM set_config('rh.sistema', 'on', true);
  UPDATE public.rh_candidatos c
     SET auth_user_id = auth.uid()
   WHERE c.id = (
     SELECT x.id FROM public.rh_candidatos x
      WHERE lower(x.email) = v_email AND x.auth_user_id IS NULL
        AND x.ativo AND x.anonimizado_em IS NULL
      ORDER BY x.created_at
      LIMIT 1
   )
  RETURNING c.id INTO v_id;
  PERFORM set_config('rh.sistema', 'off', true);

  RETURN v_id;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rh_vincular_candidato() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_vincular_candidato() TO authenticated, service_role;

-- O que o candidato vê do próprio processo. Repare no que NÃO está
-- aqui: score, parecer, motivo de reprovação e faixa salarial.
DROP VIEW IF EXISTS public.vw_rh_minhas_candidaturas;
CREATE VIEW public.vw_rh_minhas_candidaturas AS
SELECT
  c.id                        AS candidatura_id,
  c.candidato_id,
  c.vaga_id,
  c.status,
  c.data_inscricao,
  c.data_ultima_movimentacao,
  v.codigo                    AS vaga_codigo,
  v.titulo                    AS vaga_titulo,
  v.cidade,
  v.uf,
  v.local_trabalho,
  v.tipo_contratacao,
  v.slug                      AS vaga_slug,
  e.nome                      AS etapa_nome,
  e.tipo                      AS etapa_tipo,
  e.ordem                     AS etapa_ordem,
  a.id                        AS admissao_id,
  a.codigo                    AS admissao_codigo,
  a.status                    AS admissao_status,
  a.data_prevista_admissao
FROM public.rh_candidaturas c
JOIN public.rh_vagas        v ON v.id = c.vaga_id
JOIN public.rh_funil_etapas e ON e.id = c.etapa_id
LEFT JOIN public.rh_admissoes a
       ON a.candidatura_id = c.id AND a.status <> 'cancelada'
WHERE c.candidato_id = public.rh_candidato_atual();

COMMENT ON VIEW public.vw_rh_minhas_candidaturas IS
  'A visão do candidato sobre o próprio processo. Roda com privilégio do dono e filtra por rh_candidato_atual(). Não traz score, parecer nem motivo de reprovação — a coluna não existe aqui.';

GRANT SELECT ON public.vw_rh_minhas_candidaturas TO authenticated;

-- Desistir do processo. O motivo do catálogo é escolhido pelo
-- sistema: obrigar o candidato a classificar a própria desistência
-- numa lista interna do RH não faz sentido.
CREATE OR REPLACE FUNCTION public.rh_candidato_desistir(p_candidatura uuid, p_motivo text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cand      uuid := public.rh_candidato_atual();
  v_old       public.rh_candidaturas;
  v_etapa     public.rh_funil_etapas;
  v_motivo_id uuid;
  v_texto     text;
BEGIN
  IF v_cand IS NULL THEN RAISE EXCEPTION 'Sem cadastro vinculado a este login.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_old FROM public.rh_candidaturas WHERE id = p_candidatura AND candidato_id = v_cand;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_old.status <> 'em_andamento' THEN
    RAISE EXCEPTION 'Este processo já está encerrado.' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_etapa FROM public.rh_funil_etapas
   WHERE ativo AND status_resultante = 'desistiu' ORDER BY ordem LIMIT 1;
  IF NOT FOUND THEN
    SELECT * INTO v_etapa FROM public.rh_funil_etapas
     WHERE ativo AND tipo = 'final_negativa' ORDER BY ordem LIMIT 1;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'Funil sem etapa de desistência configurada.' USING ERRCODE = 'P0002'; END IF;

  SELECT id INTO v_motivo_id FROM public.rh_motivos_reprovacao
   WHERE ativo ORDER BY (lower(nome) LIKE 'outro%') DESC, ordem DESC LIMIT 1;

  v_texto := CASE WHEN char_length(btrim(coalesce(p_motivo, ''))) >= 5
                  THEN btrim(p_motivo)
                  ELSE 'Desistência informada pelo candidato na área dele, sem detalhamento.' END;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_candidaturas
     SET etapa_id = v_etapa.id,
         status = 'desistiu',
         data_ultima_movimentacao = now(),
         motivo_reprovacao_id = v_motivo_id,
         motivo_reprovacao_texto = v_texto
   WHERE id = p_candidatura;

  INSERT INTO public.rh_candidatura_historico
    (candidatura_id, etapa_anterior_id, etapa_nova_id, status_anterior, status_novo, nota, autor_nome)
  VALUES (p_candidatura, v_old.etapa_id, v_etapa.id, v_old.status, 'desistiu',
          'Desistência pela área do candidato: ' || v_texto, 'Candidato');
  PERFORM set_config('rh.movimentacao', 'off', true);

  RETURN true;
END;
$fn$;

-- Aceitar ou recusar a proposta: registra no histórico sem mover a
-- etapa. Quem move o candidato continua sendo o RH — aqui é só o
-- recado dele chegando com data e hora.
CREATE OR REPLACE FUNCTION public.rh_candidato_responder_proposta(
  p_candidatura uuid, p_aceita boolean, p_nota text DEFAULT ''
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_cand uuid := public.rh_candidato_atual();
  v_old  public.rh_candidaturas;
BEGIN
  IF v_cand IS NULL THEN RAISE EXCEPTION 'Sem cadastro vinculado a este login.' USING ERRCODE = '42501'; END IF;

  SELECT * INTO v_old FROM public.rh_candidaturas WHERE id = p_candidatura AND candidato_id = v_cand;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada.' USING ERRCODE = 'P0002'; END IF;

  INSERT INTO public.rh_candidatura_historico
    (candidatura_id, etapa_anterior_id, etapa_nova_id, status_anterior, status_novo, nota, autor_nome)
  VALUES (
    p_candidatura, v_old.etapa_id, v_old.etapa_id, v_old.status, v_old.status,
    CASE WHEN p_aceita THEN 'Candidato ACEITOU a proposta pela área do candidato.'
         ELSE 'Candidato RECUSOU a proposta pela área do candidato.' END
      || CASE WHEN char_length(btrim(coalesce(p_nota, ''))) > 0 THEN ' ' || btrim(p_nota) ELSE '' END,
    'Candidato');

  RETURN true;
END;
$fn$;

REVOKE ALL ON FUNCTION public.rh_candidato_desistir(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_candidato_desistir(uuid, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.rh_candidato_responder_proposta(uuid, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_candidato_responder_proposta(uuid, boolean, text) TO authenticated, service_role;

COMMIT;
