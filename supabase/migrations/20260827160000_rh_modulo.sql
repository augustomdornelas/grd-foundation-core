-- ============================================================
-- Módulo de RH — fundação de dados e acesso (Etapa 1)
-- ------------------------------------------------------------
-- LEITURA DO BANCO REAL FEITA ANTES DE ESCREVER (via PostgREST,
-- tabela a tabela e coluna a coluna, porque a raiz OpenAPI exige
-- service_role). O que foi confirmado no projeto fpuwyndpmcgwkuaqbcvm
-- em 27/08/2026, e que contraria o briefing:
--
--   * `funcionarios` EXISTE e tem dados. A migration de EPIs
--     (20260808163000) foi aplicada. A coluna de admissão chama-se
--     `data_admissao`, NÃO `admissao`. Por isso este arquivo estende
--     a tabela e não recria nada dela.
--   * `projetos.id` é uuid. `projetos` NÃO tem codigo/ativo/cidade/
--     uf/data_fim/gestor_id. Só o que existe é referenciado aqui.
--   * `profiles` tem id/nome/email/perfil/permissoes/ativo e NÃO tem
--     projeto_id nem funcionario_id — ou seja, não existia nenhum
--     vínculo usuário↔obra. Sem ele a regra "engenheiro vê só a obra
--     dele" é impossível; a tabela rh_usuario_projetos abaixo é esse
--     vínculo.
--   * `funcionarios`, `epis`, `entregas_epi` e `entrega_epi_itens`
--     estavam com GRANT SELECT para `anon` e policy USING (true):
--     nome, CPF e RG de todo mundo liam-se sem login. Fechado no
--     bloco 6 deste arquivo.
--   * Nenhuma tabela rh_* existia.
--
-- DESENHO DE SEGURANÇA (vale para o arquivo inteiro)
--   Dinheiro (salário, faixa salarial, pretensão) vive só em tabela
--   cuja policy de SELECT exige Diretoria ou RH. Quem não é Diretoria
--   nem RH — Administrativo, Engenharia, Almoxarifado — enxerga o
--   módulo pelas VIEWS vw_rh_*, que não têm essas colunas. Não é a
--   tela que esconde: a coluna não chega na API.
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Funções de apoio: papel do usuário e vínculo com obras
-- ------------------------------------------------------------
-- Todas SECURITY DEFINER porque leem `profiles`, que tem RLS. Sem
-- isso, uma policy que chamasse estas funções entraria em recursão.

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_perfil_atual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT lower(btrim(coalesce(p.perfil, ''))) FROM public.profiles p WHERE p.id = auth.uid();
$fn$;
COMMENT ON FUNCTION public.rh_perfil_atual() IS
  'Perfil do usuário logado em minúsculas. Valores usados pelo módulo: administrador, diretoria, rh, administrativo, engenharia, almoxarifado, campo, colaborador.';

-- Diretoria e Administrador enxergam tudo.
CREATE OR REPLACE FUNCTION public.rh_e_direcao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria');
$fn$;

-- Quem edita o módulo de RH: Diretoria + RH/DP.
CREATE OR REPLACE FUNCTION public.rh_pode_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh');
$fn$;

-- Quem lê o módulo: os de cima + Administrativo (só leitura).
CREATE OR REPLACE FUNCTION public.rh_pode_ler()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh', 'administrativo');
$fn$;

-- Quem conduz admissão: Diretoria, RH e Administrativo (matriz do briefing).
CREATE OR REPLACE FUNCTION public.rh_pode_admissao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh', 'administrativo');
$fn$;

-- Gestor de obra: engenheiro/coordenador. 'projetos' entra porque é o
-- perfil que a engenharia usa hoje, antes da reclassificação das contas.
CREATE OR REPLACE FUNCTION public.rh_e_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('engenharia', 'projetos');
$fn$;

CREATE OR REPLACE FUNCTION public.rh_e_almoxarifado()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() = 'almoxarifado';
$fn$;

-- Regra 10 do briefing: só estes leem dinheiro.
CREATE OR REPLACE FUNCTION public.rh_ve_remuneracao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh');
$fn$;

-- ------------------------------------------------------------
-- 0.1) Vínculo usuário -> obra
-- ------------------------------------------------------------
-- Não existia no banco. É o que sustenta "engenheiro vê as vagas, os
-- candidatos e a equipe DA OBRA DELE". Sem linha aqui, o engenheiro
-- não vê nada de RH — falha fechada, de propósito.
CREATE TABLE IF NOT EXISTS public.rh_usuario_projetos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Sem FK para profiles, mesma razão de orcamento_custos.autor_id:
  -- o vínculo não pode quebrar por causa de perfil ainda não criado.
  usuario_id  uuid NOT NULL,
  projeto_id  uuid NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  papel       text NOT NULL DEFAULT 'gestor' CHECK (papel IN ('gestor', 'coordenador', 'apoio')),
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rh_usuario_projetos_unico UNIQUE (usuario_id, projeto_id)
);
COMMENT ON TABLE public.rh_usuario_projetos IS
  'Quais obras cada usuário responde. Base de toda policy "só a obra dele" do módulo de RH.';

CREATE INDEX IF NOT EXISTS idx_rh_usuario_projetos_usuario
  ON public.rh_usuario_projetos (usuario_id, ativo);

CREATE OR REPLACE FUNCTION public.rh_projetos_do_usuario()
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT up.projeto_id FROM public.rh_usuario_projetos up
   WHERE up.usuario_id = auth.uid() AND up.ativo;
$fn$;

-- ------------------------------------------------------------
-- 0.2) Numeração sequencial (VAGA-2026-001, ADM-2026-001, matrícula)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_sequencias (
  chave text PRIMARY KEY,
  valor integer NOT NULL DEFAULT 0
);
COMMENT ON TABLE public.rh_sequencias IS
  'Contadores de código do módulo. O INSERT ... ON CONFLICT DO UPDATE é atômico: dois cadastros simultâneos não tiram o mesmo número.';

CREATE OR REPLACE FUNCTION public.rh_proximo_codigo(p_prefixo text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_ano   int := extract(year FROM now())::int;
  v_valor int;
BEGIN
  INSERT INTO public.rh_sequencias (chave, valor)
       VALUES (p_prefixo || '-' || v_ano, 1)
  ON CONFLICT (chave) DO UPDATE SET valor = public.rh_sequencias.valor + 1
    RETURNING valor INTO v_valor;
  RETURN p_prefixo || '-' || v_ano || '-' || lpad(v_valor::text, 3, '0');
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_proxima_matricula()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_valor int;
BEGIN
  INSERT INTO public.rh_sequencias (chave, valor) VALUES ('MATRICULA', 1)
  ON CONFLICT (chave) DO UPDATE SET valor = public.rh_sequencias.valor + 1
    RETURNING valor INTO v_valor;
  RETURN lpad(v_valor::text, 5, '0');
END;
$fn$;

-- Slug de vaga sem depender da extensão unaccent (não ligada neste projeto).
CREATE OR REPLACE FUNCTION public.rh_slug(p_texto text)
RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT btrim(
           regexp_replace(
             regexp_replace(
               lower(translate(coalesce(p_texto, ''),
                     'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
                     'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')),
               '[^a-z0-9]+', '-', 'g'),
             '(^-+|-+$)', '', 'g'),
           '-');
$fn$;

-- Validação de CPF (dígitos verificadores). Vazio passa: nem todo
-- candidato de banco de talentos deixa CPF.
CREATE OR REPLACE FUNCTION public.rh_cpf_valido(p_cpf text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  v  text := regexp_replace(coalesce(p_cpf, ''), '[^0-9]', '', 'g');
  s  int := 0;
  d1 int;
  d2 int;
  i  int;
BEGIN
  IF v = '' THEN RETURN true; END IF;
  IF length(v) <> 11 THEN RETURN false; END IF;
  IF v ~ '^(.)\1{10}$' THEN RETURN false; END IF;
  FOR i IN 1..9 LOOP s := s + substr(v, i, 1)::int * (11 - i); END LOOP;
  d1 := 11 - (s % 11);
  IF d1 >= 10 THEN d1 := 0; END IF;
  s := 0;
  FOR i IN 1..10 LOOP s := s + substr(v, i, 1)::int * (12 - i); END LOOP;
  d2 := 11 - (s % 11);
  IF d2 >= 10 THEN d2 := 0; END IF;
  RETURN d1 = substr(v, 10, 1)::int AND d2 = substr(v, 11, 1)::int;
END;
$fn$;

-- Histórico é imutável: esta função é o "não" que a trigger dá.
CREATE OR REPLACE FUNCTION public.rh_bloqueia_alteracao()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'Histórico é imutável: % não é permitido em %.', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '42501';
END;
$fn$;

-- Guarda das regras 1 e 2: etapa/status só mudam por dentro das
-- funções rh_mover_*, que gravam a nota na mesma transação. Qualquer
-- UPDATE direto pela API é recusado.
CREATE OR REPLACE FUNCTION public.rh_em_movimentacao()
RETURNS boolean LANGUAGE sql STABLE AS $fn$
  SELECT coalesce(current_setting('rh.movimentacao', true), 'off') = 'on';
$fn$;

GRANT SELECT, INSERT, UPDATE ON public.rh_usuario_projetos TO authenticated;
GRANT ALL ON public.rh_usuario_projetos TO service_role;
GRANT ALL ON public.rh_sequencias TO service_role;

ALTER TABLE public.rh_usuario_projetos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rh_sequencias       ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_usuario_projetos leitura" ON public.rh_usuario_projetos;
CREATE POLICY "rh_usuario_projetos leitura" ON public.rh_usuario_projetos
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR usuario_id = auth.uid());

DROP POLICY IF EXISTS "rh_usuario_projetos escrita" ON public.rh_usuario_projetos;
CREATE POLICY "rh_usuario_projetos escrita" ON public.rh_usuario_projetos
  FOR ALL TO authenticated
  USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar());

-- rh_sequencias não tem policy: ninguém acessa direto, só as funções
-- SECURITY DEFINER acima. RLS ligado sem policy = negado para todos.

DROP TRIGGER IF EXISTS trg_rh_usuario_projetos_updated ON public.rh_usuario_projetos;
CREATE TRIGGER trg_rh_usuario_projetos_updated
  BEFORE UPDATE ON public.rh_usuario_projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
-- ============================================================
-- 1) Catálogos
-- ------------------------------------------------------------
-- Regra de acesso comum a todos os catálogos:
--   leitura  — RH, Diretoria, Administrativo, Engenharia, Almoxarifado
--   escrita  — Diretoria e RH
-- Campo não lê nada (não cai em nenhuma das funções).
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1.1) Tipos de documento
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_tipos_documento (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                   text NOT NULL,
  descricao              text NOT NULL DEFAULT '',
  categoria              text NOT NULL DEFAULT 'outro'
                         CHECK (categoria IN ('pessoal', 'saude', 'treinamento', 'trabalhista', 'outro')),
  tem_vencimento         boolean NOT NULL DEFAULT false,
  validade_padrao_meses  integer NOT NULL DEFAULT 0,
  obrigatorio_admissao   boolean NOT NULL DEFAULT false,
  bloqueia_alocacao      boolean NOT NULL DEFAULT false,
  ordem                  integer NOT NULL DEFAULT 0,
  ativo                  boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_tipos_documento.bloqueia_alocacao IS
  'true = vencido ou ausente derruba a aptidão do colaborador para entrar em obra (regra 8 e 9).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_tipos_documento_nome
  ON public.rh_tipos_documento (lower(nome));

-- ------------------------------------------------------------
-- 1.2) Modelos de checklist de admissão
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_checklist_modelos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  descricao         text NOT NULL DEFAULT '',
  tipo_contratacao  text NOT NULL DEFAULT 'clt'
                    CHECK (tipo_contratacao IN ('clt', 'temporario', 'experiencia', 'estagio', 'pj', 'terceirizado')),
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_checklist_modelos_nome
  ON public.rh_checklist_modelos (lower(nome));

CREATE TABLE IF NOT EXISTS public.rh_checklist_modelo_itens (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modelo_id          uuid NOT NULL REFERENCES public.rh_checklist_modelos(id) ON DELETE CASCADE,
  titulo             text NOT NULL,
  categoria          text NOT NULL DEFAULT 'documento'
                     CHECK (categoria IN ('documento', 'exame', 'treinamento', 'epi', 'sistema', 'contrato')),
  tipo_documento_id  uuid REFERENCES public.rh_tipos_documento(id) ON DELETE SET NULL,
  obrigatorio        boolean NOT NULL DEFAULT true,
  responsavel_padrao text NOT NULL DEFAULT 'rh'
                     CHECK (responsavel_padrao IN ('rh', 'candidato', 'almoxarifado', 'gestor')),
  ordem              integer NOT NULL DEFAULT 0,
  instrucoes         text NOT NULL DEFAULT '',
  ativo              boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_checklist_modelo_itens_modelo
  ON public.rh_checklist_modelo_itens (modelo_id, ordem);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_checklist_modelo_itens_titulo
  ON public.rh_checklist_modelo_itens (modelo_id, lower(titulo));

-- ------------------------------------------------------------
-- 1.3) Cargos — o catálogo que amarra exigência a função
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_cargos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                 text NOT NULL,
  cbo                  text NOT NULL DEFAULT '',
  setor                text NOT NULL DEFAULT '',
  descricao            text NOT NULL DEFAULT '',
  atividades           text NOT NULL DEFAULT '',
  requisitos           text NOT NULL DEFAULT '',
  escolaridade_minima  text NOT NULL DEFAULT '',
  nrs_exigidas         text[] NOT NULL DEFAULT '{}',
  exige_cnh            boolean NOT NULL DEFAULT false,
  categoria_cnh        text NOT NULL DEFAULT '',
  epis_padrao          uuid[] NOT NULL DEFAULT '{}',
  checklist_modelo_id  uuid REFERENCES public.rh_checklist_modelos(id) ON DELETE SET NULL,
  ativo                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_cargos.nrs_exigidas IS
  'Nomes de rh_tipos_documento que o cargo exige, ex.: {NR-10, NR-35}. É o que decide quem pode ser alocado (regra 8).';
COMMENT ON COLUMN public.rh_cargos.epis_padrao IS
  'IDs de public.epis. Alimenta o checklist de admissão e a checagem de EPI entregue.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_cargos_nome ON public.rh_cargos (lower(nome));

-- Faixa salarial do cargo: fora da tabela, pela regra 10. Ver a nota
-- longa no topo do bloco 2 sobre por que a coluna não pode ficar aqui.
CREATE TABLE IF NOT EXISTS public.rh_cargo_faixa (
  cargo_id   uuid PRIMARY KEY REFERENCES public.rh_cargos(id) ON DELETE CASCADE,
  minimo     numeric(12,2),
  maximo     numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 1.4) Etapas do funil
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_funil_etapas (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome              text NOT NULL,
  ordem             integer NOT NULL DEFAULT 0,
  tipo              text NOT NULL DEFAULT 'intermediaria'
                    CHECK (tipo IN ('inicial', 'intermediaria', 'final_positiva', 'final_negativa', 'final_neutra')),
  sla_dias          integer NOT NULL DEFAULT 0,
  cor               text NOT NULL DEFAULT '#1F3367',
  opcional          boolean NOT NULL DEFAULT false,
  permite_gestor    boolean NOT NULL DEFAULT false,
  status_resultante text CHECK (status_resultante IN ('em_andamento', 'aprovado', 'reprovado', 'desistiu', 'contratado', 'banco_talentos')),
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_funil_etapas.status_resultante IS
  'Status que a candidatura assume ao entrar nesta etapa. NULL = em_andamento. Existe para não deduzir status pelo NOME da etapa, que o RH pode renomear na tela de configurações.';
COMMENT ON COLUMN public.rh_funil_etapas.permite_gestor IS
  'true = engenheiro/coordenador da obra da vaga pode mover o candidato para cá.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_funil_etapas_nome ON public.rh_funil_etapas (lower(nome));
CREATE INDEX IF NOT EXISTS idx_rh_funil_etapas_ordem ON public.rh_funil_etapas (ativo, ordem);

-- ------------------------------------------------------------
-- 1.5) Motivos de reprovação
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_motivos_reprovacao (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  ordem      integer NOT NULL DEFAULT 0,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_motivos_reprovacao_nome
  ON public.rh_motivos_reprovacao (lower(nome));

-- ------------------------------------------------------------
-- 1.6) Grants, RLS e triggers dos catálogos
-- ------------------------------------------------------------
-- Sem DELETE em lugar nenhum: nada se apaga, tudo se inativa (regra 12).
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rh_tipos_documento', 'rh_checklist_modelos', 'rh_checklist_modelo_itens',
    'rh_cargos', 'rh_funil_etapas', 'rh_motivos_reprovacao'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s leitura" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s escrita" ON public.%I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s leitura" ON public.%I FOR SELECT TO authenticated
      USING (public.rh_pode_ler() OR public.rh_e_gestor() OR public.rh_e_almoxarifado())
    $pol$, t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s escrita" ON public.%I FOR ALL TO authenticated
      USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar())
    $pol$, t, t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format($trg$
      CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()
    $trg$, t, t);
  END LOOP;
END;
$blk$;

-- A faixa salarial do cargo mora à parte e só Diretoria e RH leem.
GRANT SELECT, INSERT, UPDATE ON public.rh_cargo_faixa TO authenticated;
GRANT ALL ON public.rh_cargo_faixa TO service_role;
REVOKE ALL ON public.rh_cargo_faixa FROM anon;
ALTER TABLE public.rh_cargo_faixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_cargo_faixa leitura" ON public.rh_cargo_faixa;
DROP POLICY IF EXISTS "rh_cargo_faixa escrita" ON public.rh_cargo_faixa;
CREATE POLICY "rh_cargo_faixa leitura" ON public.rh_cargo_faixa
  FOR SELECT TO authenticated USING (public.rh_ve_remuneracao());
CREATE POLICY "rh_cargo_faixa escrita" ON public.rh_cargo_faixa
  FOR ALL TO authenticated USING (public.rh_ve_remuneracao()) WITH CHECK (public.rh_ve_remuneracao());
DROP TRIGGER IF EXISTS trg_rh_cargo_faixa_updated ON public.rh_cargo_faixa;
CREATE TRIGGER trg_rh_cargo_faixa_updated
  BEFORE UPDATE ON public.rh_cargo_faixa
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

COMMIT;
-- ============================================================
-- 2) Recrutamento: vagas, candidatos, candidaturas, avaliações
-- ------------------------------------------------------------
-- DESVIO CONSCIENTE DO BRIEFING, e a razão dele:
--   O briefing lista faixa_salarial_min/max dentro de rh_vagas e
--   pretensao_salarial dentro de rh_candidatos, e ao mesmo tempo exige
--   (regra 10) que dinheiro só chegue a Diretoria e RH "por RLS, não
--   apenas escondendo na tela".
--   RLS no Postgres filtra LINHA, não COLUNA, e no Supabase todo mundo
--   logado é o mesmo papel de banco (`authenticated`) — logo não existe
--   GRANT de coluna que separe RH de Engenharia.
--   A única forma de a coluna não chegar na API é ela morar em outra
--   tabela, com policy própria. É o que o próprio briefing faz com o
--   salário do colaborador (rh_funcionario_remuneracao). Aqui a mesma
--   solução é aplicada à faixa da vaga e à pretensão do candidato.
--   Efeito prático: engenheiro e administrativo leem a vaga e o
--   candidato inteiros, menos o dinheiro, que nem transita.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 2.1) Vagas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_vagas (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                      text NOT NULL DEFAULT '',
  titulo                      text NOT NULL,
  cargo_id                    uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  setor                       text NOT NULL DEFAULT '',
  projeto_id                  uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  tipo_contratacao            text NOT NULL DEFAULT 'clt'
                              CHECK (tipo_contratacao IN ('clt', 'temporario', 'experiencia', 'estagio', 'pj', 'terceirizado')),
  quantidade_posicoes         integer NOT NULL DEFAULT 1 CHECK (quantidade_posicoes > 0),
  quantidade_preenchida       integer NOT NULL DEFAULT 0 CHECK (quantidade_preenchida >= 0),
  jornada                     text NOT NULL DEFAULT '',
  local_trabalho              text NOT NULL DEFAULT '',
  cidade                      text NOT NULL DEFAULT '',
  uf                          text NOT NULL DEFAULT '',
  salario_confidencial        boolean NOT NULL DEFAULT true,
  beneficios                  text NOT NULL DEFAULT '',
  descricao                   text NOT NULL DEFAULT '',
  requisitos                  text NOT NULL DEFAULT '',
  diferenciais                text NOT NULL DEFAULT '',
  motivo_abertura             text NOT NULL DEFAULT 'aumento_quadro'
                              CHECK (motivo_abertura IN ('aumento_quadro', 'substituicao', 'nova_obra', 'temporario')),
  substituindo_funcionario_id uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  data_abertura               date NOT NULL DEFAULT CURRENT_DATE,
  data_prevista_inicio        date,
  data_limite                 date,
  data_encerramento           date,
  status                      text NOT NULL DEFAULT 'rascunho'
                              CHECK (status IN ('rascunho', 'aguardando_aprovacao', 'aprovada', 'publicada', 'congelada', 'encerrada', 'cancelada')),
  publicada_site              boolean NOT NULL DEFAULT false,
  slug                        text,
  solicitante_id              uuid,
  aprovador_id                uuid,
  data_aprovacao              timestamptz,
  responsavel_rh_id           uuid,
  ativo                       boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_vagas.quantidade_preenchida IS
  'Mantido por trigger a partir das candidaturas contratadas. O front nunca escreve aqui.';
COMMENT ON COLUMN public.rh_vagas.publicada_site IS
  'Só vira true por rh_publicar_vaga(), que exige status = aprovada e os campos obrigatórios preenchidos (regra 3).';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_vagas_codigo ON public.rh_vagas (codigo) WHERE codigo <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_vagas_slug   ON public.rh_vagas (slug)   WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_vagas_status  ON public.rh_vagas (status, ativo);
CREATE INDEX IF NOT EXISTS idx_rh_vagas_projeto ON public.rh_vagas (projeto_id);
CREATE INDEX IF NOT EXISTS idx_rh_vagas_cargo   ON public.rh_vagas (cargo_id);

-- Faixa salarial da vaga: fora da tabela, por causa da regra 10.
CREATE TABLE IF NOT EXISTS public.rh_vaga_faixa (
  vaga_id    uuid PRIMARY KEY REFERENCES public.rh_vagas(id) ON DELETE CASCADE,
  minimo     numeric(12,2),
  maximo     numeric(12,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rh_vaga_faixa IS
  'Faixa salarial da vaga. Tabela separada porque RLS filtra linha, não coluna: é assim que a faixa não chega na API de quem não é Diretoria ou RH.';

CREATE TABLE IF NOT EXISTS public.rh_vaga_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id         uuid NOT NULL REFERENCES public.rh_vagas(id) ON DELETE CASCADE,
  status_anterior text NOT NULL DEFAULT '',
  status_novo     text NOT NULL DEFAULT '',
  nota            text NOT NULL CHECK (char_length(btrim(nota)) >= 5),
  autor_id        uuid,
  autor_nome      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_vaga_historico_vaga ON public.rh_vaga_historico (vaga_id, created_at DESC);

-- ------------------------------------------------------------
-- 2.2) Candidatos — base única de pessoas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_candidatos (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome                  text NOT NULL,
  cpf                   text NOT NULL DEFAULT '' CHECK (public.rh_cpf_valido(cpf)),
  rg                    text NOT NULL DEFAULT '',
  data_nascimento       date,
  email                 text NOT NULL DEFAULT '',
  telefone              text NOT NULL DEFAULT '',
  whatsapp              text NOT NULL DEFAULT '',
  cidade                text NOT NULL DEFAULT '',
  uf                    text NOT NULL DEFAULT '',
  endereco              jsonb NOT NULL DEFAULT '{}'::jsonb,
  cargo_pretendido      text NOT NULL DEFAULT '',
  disponibilidade       text NOT NULL DEFAULT 'a_combinar'
                        CHECK (disponibilidade IN ('imediata', '15_dias', '30_dias', 'a_combinar')),
  disponibilidade_viagem boolean NOT NULL DEFAULT false,
  possui_cnh            boolean NOT NULL DEFAULT false,
  categoria_cnh         text NOT NULL DEFAULT '',
  nrs_declaradas        jsonb NOT NULL DEFAULT '[]'::jsonb,
  escolaridade          text NOT NULL DEFAULT '',
  experiencia_resumo    text NOT NULL DEFAULT '',
  linkedin              text NOT NULL DEFAULT '',
  curriculo_path        text,
  foto_path             text,
  origem                text NOT NULL DEFAULT 'cadastro_interno'
                        CHECK (origem IN ('site', 'indicacao', 'whatsapp', 'banco_talentos', 'agencia', 'mural', 'cadastro_interno')),
  origem_detalhe        text NOT NULL DEFAULT '',
  indicado_por          text NOT NULL DEFAULT '',
  observacoes           text NOT NULL DEFAULT '',
  status                text NOT NULL DEFAULT 'ativo'
                        CHECK (status IN ('ativo', 'em_processo', 'contratado', 'banco_talentos', 'descartado', 'nao_disponivel')),
  funcionario_id        uuid,
  lgpd_consentimento    boolean NOT NULL DEFAULT false,
  lgpd_data             timestamptz,
  lgpd_retencao_ate     date,
  anonimizado_em        timestamptz,
  auth_user_id          uuid,
  ativo                 boolean NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_candidatos.nrs_declaradas IS
  'O que o candidato DIZ que tem: [{"nr":"NR-10","validade":"2027-05-01"}]. Só vira documento válido depois de conferido na admissão.';
COMMENT ON COLUMN public.rh_candidatos.lgpd_retencao_ate IS
  'Padrão 24 meses a partir do consentimento (regra 13). Vencido, o candidato entra na lista de expurgo do RH.';
COMMENT ON COLUMN public.rh_candidatos.anonimizado_em IS
  'Preenchido por rh_anonimizar_candidato(). Nome, CPF, contatos e currículo são apagados; a linha fica para a estatística não mentir.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_candidatos_cpf
  ON public.rh_candidatos (regexp_replace(cpf, '[^0-9]', '', 'g')) WHERE cpf <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_candidatos_auth
  ON public.rh_candidatos (auth_user_id) WHERE auth_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_nome   ON public.rh_candidatos (lower(nome));
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_status ON public.rh_candidatos (status, ativo);

-- Pretensão salarial: fora da tabela, mesma razão da faixa da vaga.
CREATE TABLE IF NOT EXISTS public.rh_candidato_pretensao (
  candidato_id uuid PRIMARY KEY REFERENCES public.rh_candidatos(id) ON DELETE CASCADE,
  valor        numeric(12,2),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 2.3) Candidaturas — o candidato dentro de uma vaga
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_candidaturas (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id             uuid NOT NULL REFERENCES public.rh_candidatos(id) ON DELETE CASCADE,
  vaga_id                  uuid NOT NULL REFERENCES public.rh_vagas(id) ON DELETE CASCADE,
  etapa_id                 uuid NOT NULL REFERENCES public.rh_funil_etapas(id),
  status                   text NOT NULL DEFAULT 'em_andamento'
                           CHECK (status IN ('em_andamento', 'aprovado', 'reprovado', 'desistiu', 'contratado', 'banco_talentos')),
  data_inscricao           timestamptz NOT NULL DEFAULT now(),
  data_ultima_movimentacao timestamptz NOT NULL DEFAULT now(),
  score                    integer CHECK (score IS NULL OR (score >= 0 AND score <= 100)),
  responsavel_id           uuid,
  motivo_reprovacao_id     uuid REFERENCES public.rh_motivos_reprovacao(id) ON DELETE SET NULL,
  motivo_reprovacao_texto  text,
  origem                   text NOT NULL DEFAULT 'cadastro_interno',
  admissao_id              uuid,
  ativo                    boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rh_candidaturas_unica UNIQUE (candidato_id, vaga_id)
);
COMMENT ON COLUMN public.rh_candidaturas.status IS
  'banco_talentos entra no conjunto do briefing porque a etapa final neutra existe e nenhum dos outros valores a descreve sem mentir.';
COMMENT ON COLUMN public.rh_candidaturas.data_ultima_movimentacao IS
  'Base do contador de dias parado e do semáforo (regra 15). Só a função rh_mover_candidatura escreve aqui.';

CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_vaga  ON public.rh_candidaturas (vaga_id, etapa_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_cand  ON public.rh_candidaturas (candidato_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_etapa ON public.rh_candidaturas (etapa_id, data_ultima_movimentacao);

CREATE TABLE IF NOT EXISTS public.rh_candidatura_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id  uuid NOT NULL REFERENCES public.rh_candidaturas(id) ON DELETE CASCADE,
  etapa_anterior_id uuid REFERENCES public.rh_funil_etapas(id),
  etapa_nova_id     uuid REFERENCES public.rh_funil_etapas(id),
  status_anterior text NOT NULL DEFAULT '',
  status_novo     text NOT NULL DEFAULT '',
  nota            text NOT NULL CHECK (char_length(btrim(nota)) >= 5),
  autor_id        uuid,
  autor_nome      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_candidatura_historico_cand
  ON public.rh_candidatura_historico (candidatura_id, created_at DESC);

-- ------------------------------------------------------------
-- 2.4) Avaliações (entrevistas, testes, pareceres)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_avaliacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid NOT NULL REFERENCES public.rh_candidaturas(id) ON DELETE CASCADE,
  tipo           text NOT NULL DEFAULT 'entrevista_rh'
                 CHECK (tipo IN ('triagem', 'entrevista_rh', 'entrevista_tecnica', 'teste_pratico', 'dinamica')),
  avaliador_id   uuid,
  avaliador_nome text NOT NULL DEFAULT '',
  data_hora      timestamptz,
  local          text NOT NULL DEFAULT '',
  criterios      jsonb NOT NULL DEFAULT '[]'::jsonb,
  nota_final     numeric(5,2),
  parecer        text NOT NULL DEFAULT '',
  recomendacao   text CHECK (recomendacao IN ('aprovar', 'talvez', 'reprovar')),
  anexos         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'agendada'
                 CHECK (status IN ('agendada', 'realizada', 'nao_compareceu', 'cancelada')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  -- Parecer é obrigatório quando a entrevista aconteceu; agendar sem
  -- parecer tem de continuar possível.
  CONSTRAINT rh_avaliacoes_parecer_realizada
    CHECK (status <> 'realizada' OR char_length(btrim(parecer)) >= 5)
);
COMMENT ON COLUMN public.rh_avaliacoes.criterios IS
  '[{"criterio":"experiência","nota":8}, ...] — experiência, técnica, segurança, comunicação, disponibilidade.';

CREATE INDEX IF NOT EXISTS idx_rh_avaliacoes_cand ON public.rh_avaliacoes (candidatura_id, created_at DESC);

-- ------------------------------------------------------------
-- 2.5) Anexos do candidato
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_candidato_anexos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id   uuid NOT NULL REFERENCES public.rh_candidatos(id) ON DELETE CASCADE,
  candidatura_id uuid REFERENCES public.rh_candidaturas(id) ON DELETE SET NULL,
  tipo           text NOT NULL DEFAULT 'outro',
  nome_arquivo   text NOT NULL DEFAULT '',
  path           text NOT NULL,
  tamanho        bigint NOT NULL DEFAULT 0,
  autor_id       uuid,
  ativo          boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_candidato_anexos_cand ON public.rh_candidato_anexos (candidato_id);

COMMIT;
-- ============================================================
-- 3) Admissão e colaboradores
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 3.1) Admissões
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_admissoes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo                  text NOT NULL DEFAULT '',
  candidatura_id          uuid REFERENCES public.rh_candidaturas(id) ON DELETE SET NULL,
  candidato_id            uuid NOT NULL REFERENCES public.rh_candidatos(id) ON DELETE RESTRICT,
  funcionario_id          uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  cargo_id                uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  setor                   text NOT NULL DEFAULT '',
  projeto_id              uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  gestor_id               uuid,
  tipo_contratacao        text NOT NULL DEFAULT 'clt'
                          CHECK (tipo_contratacao IN ('clt', 'temporario', 'experiencia', 'estagio', 'pj', 'terceirizado')),
  jornada                 text NOT NULL DEFAULT '',
  data_prevista_admissao  date,
  data_efetiva_admissao   date,
  periodo_experiencia     text NOT NULL DEFAULT '30_60'
                          CHECK (periodo_experiencia IN ('30_60', '45_45', 'nao_se_aplica')),
  data_fim_experiencia_1  date,
  data_fim_experiencia_2  date,
  vale_transporte         boolean NOT NULL DEFAULT false,
  vale_refeicao           boolean NOT NULL DEFAULT false,
  observacoes             text NOT NULL DEFAULT '',
  status                  text NOT NULL DEFAULT 'aberta'
                          CHECK (status IN ('aberta', 'aguardando_candidato', 'em_conferencia', 'aguardando_exame', 'pronta', 'concluida', 'cancelada')),
  motivo_cancelamento     text NOT NULL DEFAULT '',
  responsavel_id          uuid,
  checklist_modelo_id     uuid REFERENCES public.rh_checklist_modelos(id) ON DELETE SET NULL,
  ativo                   boolean NOT NULL DEFAULT true,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rh_admissoes IS
  'candidatura_id é nullable de propósito: o briefing permite admissão avulsa, sem processo seletivo.';

CREATE UNIQUE INDEX IF NOT EXISTS ux_rh_admissoes_codigo ON public.rh_admissoes (codigo) WHERE codigo <> '';
CREATE INDEX IF NOT EXISTS idx_rh_admissoes_status  ON public.rh_admissoes (status, ativo);
CREATE INDEX IF NOT EXISTS idx_rh_admissoes_projeto ON public.rh_admissoes (projeto_id);
CREATE INDEX IF NOT EXISTS idx_rh_admissoes_cand    ON public.rh_admissoes (candidato_id);

-- Salário proposto: fora da tabela, pela regra 10 (ver nota do bloco 2).
CREATE TABLE IF NOT EXISTS public.rh_admissao_proposta (
  admissao_id       uuid PRIMARY KEY REFERENCES public.rh_admissoes(id) ON DELETE CASCADE,
  salario           numeric(12,2),
  validade_proposta date,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rh_admissao_itens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id       uuid NOT NULL REFERENCES public.rh_admissoes(id) ON DELETE CASCADE,
  titulo            text NOT NULL,
  categoria         text NOT NULL DEFAULT 'documento'
                    CHECK (categoria IN ('documento', 'exame', 'treinamento', 'epi', 'sistema', 'contrato')),
  tipo_documento_id uuid REFERENCES public.rh_tipos_documento(id) ON DELETE SET NULL,
  obrigatorio       boolean NOT NULL DEFAULT true,
  responsavel       text NOT NULL DEFAULT 'rh'
                    CHECK (responsavel IN ('rh', 'candidato', 'almoxarifado', 'gestor')),
  status            text NOT NULL DEFAULT 'pendente'
                    CHECK (status IN ('pendente', 'enviado', 'aprovado', 'reprovado', 'dispensado')),
  arquivo_path      text,
  data_documento    date,
  data_vencimento   date,
  observacao        text NOT NULL DEFAULT '',
  instrucoes        text NOT NULL DEFAULT '',
  conferido_por_id  uuid,
  conferido_em      timestamptz,
  ordem             integer NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_admissao_itens_adm ON public.rh_admissao_itens (admissao_id, ordem);

CREATE TABLE IF NOT EXISTS public.rh_admissao_historico (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admissao_id     uuid NOT NULL REFERENCES public.rh_admissoes(id) ON DELETE CASCADE,
  status_anterior text NOT NULL DEFAULT '',
  status_novo     text NOT NULL DEFAULT '',
  nota            text NOT NULL CHECK (char_length(btrim(nota)) >= 5),
  autor_id        uuid,
  autor_nome      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_admissao_historico_adm
  ON public.rh_admissao_historico (admissao_id, created_at DESC);

-- Fecha o ciclo candidatura -> admissão (a FK não podia existir antes
-- de rh_admissoes ser criada).
DO $blk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_candidaturas_admissao_fk') THEN
    ALTER TABLE public.rh_candidaturas
      ADD CONSTRAINT rh_candidaturas_admissao_fk
      FOREIGN KEY (admissao_id) REFERENCES public.rh_admissoes(id) ON DELETE SET NULL;
  END IF;
END;
$blk$;

-- ------------------------------------------------------------
-- 3.2) Colaboradores — estende a tabela que JÁ EXISTE
-- ------------------------------------------------------------
-- Confirmado no banco antes de escrever: public.funcionarios existe,
-- tem dados, e o campo de admissão chama-se data_admissao.
ALTER TABLE public.funcionarios
  ADD COLUMN IF NOT EXISTS cargo_id                       uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS data_nascimento                date,
  ADD COLUMN IF NOT EXISTS estado_civil                   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nome_mae                       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS nacionalidade                  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS naturalidade                   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pis_nis                        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ctps_numero                    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ctps_serie                     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ctps_uf                        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS titulo_eleitor                 text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS reservista                     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS escolaridade                   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS endereco                       jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS telefone                       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS email                          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS foto_path                      text,
  ADD COLUMN IF NOT EXISTS contato_emergencia_nome        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contato_emergencia_telefone    text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS contato_emergencia_parentesco  text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS banco                          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS agencia                        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS conta                          text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_conta                     text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS pix                            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tipo_contratacao               text NOT NULL DEFAULT 'clt',
  ADD COLUMN IF NOT EXISTS jornada                        text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS projeto_id                     uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gestor_id                      uuid,
  ADD COLUMN IF NOT EXISTS data_desligamento              date,
  ADD COLUMN IF NOT EXISTS motivo_desligamento            text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS situacao                       text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS candidato_id                   uuid REFERENCES public.rh_candidatos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS admissao_id                    uuid REFERENCES public.rh_admissoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS apto_alocacao                  boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.funcionarios.apto_alocacao IS
  'Cache da regra 8, mantido por trigger. A verdade sempre fresca é vw_rh_alocacao, que recalcula na hora — a coluna pode envelhecer entre um vencimento e o próximo recálculo.';
COMMENT ON COLUMN public.funcionarios.data_admissao IS
  'Nome real da coluna no banco. O briefing do módulo de RH a chama de "admissao"; é a mesma coisa.';

DO $blk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funcionarios_situacao_check') THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_situacao_check
      CHECK (situacao IN ('experiencia', 'ativo', 'afastado', 'desligado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funcionarios_tipo_contratacao_check') THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_tipo_contratacao_check
      CHECK (tipo_contratacao IN ('clt', 'temporario', 'experiencia', 'estagio', 'pj', 'terceirizado'));
  END IF;
  -- NOT VALID de propósito: a base atual veio de importação e pode ter
  -- CPF torto. A regra passa a valer para o que entrar de hoje em
  -- diante, sem derrubar a migration por causa de linha antiga.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'funcionarios_cpf_check') THEN
    ALTER TABLE public.funcionarios
      ADD CONSTRAINT funcionarios_cpf_check CHECK (public.rh_cpf_valido(cpf)) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'rh_candidatos_funcionario_fk') THEN
    ALTER TABLE public.rh_candidatos
      ADD CONSTRAINT rh_candidatos_funcionario_fk
      FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id) ON DELETE SET NULL;
  END IF;
END;
$blk$;

-- Regra 11: CPF único também entre colaboradores. Se a base atual já
-- tiver CPF repetido, o índice não nasce e a migration avisa em vez de
-- abortar — quem decide o que fazer com a duplicata é o RH, não o SQL.
DO $blk$
BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_cpf
    ON public.funcionarios (regexp_replace(cpf, '[^0-9]', '', 'g')) WHERE cpf <> '';
EXCEPTION WHEN unique_violation OR duplicate_table THEN
  RAISE WARNING 'Índice único de CPF em funcionarios NÃO foi criado: existe CPF repetido na base. Resolva as duplicatas e rode: CREATE UNIQUE INDEX ux_funcionarios_cpf ON public.funcionarios ((regexp_replace(cpf, ''[^0-9]'', '''', ''g''))) WHERE cpf <> '''';';
END;
$blk$;
CREATE UNIQUE INDEX IF NOT EXISTS ux_funcionarios_matricula
  ON public.funcionarios (matricula) WHERE matricula <> '';
CREATE INDEX IF NOT EXISTS idx_funcionarios_projeto ON public.funcionarios (projeto_id, situacao);
CREATE INDEX IF NOT EXISTS idx_funcionarios_cargo   ON public.funcionarios (cargo_id);

-- ------------------------------------------------------------
-- 3.3) Remuneração, documentos, dependentes e histórico
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rh_funcionario_remuneracao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id  uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  salario         numeric(12,2) NOT NULL DEFAULT 0,
  vigencia_inicio date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_fim    date,
  motivo          text NOT NULL DEFAULT 'admissao'
                  CHECK (motivo IN ('admissao', 'promocao', 'dissidio', 'ajuste', 'mudanca_cargo')),
  cargo_id        uuid REFERENCES public.rh_cargos(id) ON DELETE SET NULL,
  autor_id        uuid,
  autor_nome      text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.rh_funcionario_remuneracao IS
  'Tabela separada só para isolar o salário via RLS (regra 10): a policy exige Diretoria ou RH.';
CREATE INDEX IF NOT EXISTS idx_rh_remuneracao_func
  ON public.rh_funcionario_remuneracao (funcionario_id, vigencia_inicio DESC);

CREATE TABLE IF NOT EXISTS public.rh_funcionario_documentos (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id    uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo_documento_id uuid NOT NULL REFERENCES public.rh_tipos_documento(id) ON DELETE RESTRICT,
  numero            text NOT NULL DEFAULT '',
  emissor           text NOT NULL DEFAULT '',
  data_emissao      date,
  data_vencimento   date,
  arquivo_path      text,
  status            text NOT NULL DEFAULT 'valido'
                    CHECK (status IN ('valido', 'a_vencer', 'vencido', 'substituido')),
  observacao        text NOT NULL DEFAULT '',
  autor_id          uuid,
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_funcionario_documentos.status IS
  'Cache. Quem decide de verdade é a data: vw_rh_documentos_vencimento recalcula a situação a cada leitura.';
CREATE INDEX IF NOT EXISTS idx_rh_func_docs_func
  ON public.rh_funcionario_documentos (funcionario_id, ativo);
CREATE INDEX IF NOT EXISTS idx_rh_func_docs_venc
  ON public.rh_funcionario_documentos (data_vencimento) WHERE ativo;

CREATE TABLE IF NOT EXISTS public.rh_funcionario_dependentes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id       uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  nome                 text NOT NULL,
  parentesco           text NOT NULL DEFAULT '',
  data_nascimento      date,
  cpf                  text NOT NULL DEFAULT '' CHECK (public.rh_cpf_valido(cpf)),
  para_ir              boolean NOT NULL DEFAULT false,
  para_salario_familia boolean NOT NULL DEFAULT false,
  documento_path       text,
  ativo                boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rh_dependentes_func
  ON public.rh_funcionario_dependentes (funcionario_id, ativo);

CREATE TABLE IF NOT EXISTS public.rh_funcionario_historico (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  tipo           text NOT NULL DEFAULT 'admissao'
                 CHECK (tipo IN ('admissao', 'mudanca_obra', 'mudanca_cargo', 'mudanca_salario',
                                 'afastamento', 'retorno', 'advertencia', 'desligamento', 'documento')),
  descricao      text NOT NULL DEFAULT '',
  valor_anterior text NOT NULL DEFAULT '',
  valor_novo     text NOT NULL DEFAULT '',
  data_evento    date NOT NULL DEFAULT CURRENT_DATE,
  autor_id       uuid,
  autor_nome     text NOT NULL DEFAULT '',
  created_at     timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN public.rh_funcionario_historico.valor_anterior IS
  'Texto, não numérico: a mesma linha registra troca de obra, de cargo e de salário. Salário aqui entra como "confidencial" para não vazar valor por uma tabela que Engenharia lê.';
CREATE INDEX IF NOT EXISTS idx_rh_func_hist_func
  ON public.rh_funcionario_historico (funcionario_id, data_evento DESC);

COMMIT;
-- ============================================================
-- 4) Escopo por papel: funções, grants, RLS e imutabilidade
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 4.1) Funções de escopo
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rh_gestor_da_vaga(p_vaga uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_e_gestor() AND EXISTS (
    SELECT 1 FROM public.rh_vagas v
     WHERE v.id = p_vaga AND v.projeto_id IN (SELECT public.rh_projetos_do_usuario()));
$fn$;

CREATE OR REPLACE FUNCTION public.rh_gestor_da_candidatura(p_candidatura uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_e_gestor() AND EXISTS (
    SELECT 1 FROM public.rh_candidaturas c
      JOIN public.rh_vagas v ON v.id = c.vaga_id
     WHERE c.id = p_candidatura AND v.projeto_id IN (SELECT public.rh_projetos_do_usuario()));
$fn$;

CREATE OR REPLACE FUNCTION public.rh_gestor_do_candidato(p_candidato uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_e_gestor() AND EXISTS (
    SELECT 1 FROM public.rh_candidaturas c
      JOIN public.rh_vagas v ON v.id = c.vaga_id
     WHERE c.candidato_id = p_candidato AND v.projeto_id IN (SELECT public.rh_projetos_do_usuario()));
$fn$;

CREATE OR REPLACE FUNCTION public.rh_gestor_do_funcionario(p_funcionario uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_e_gestor() AND EXISTS (
    SELECT 1 FROM public.funcionarios f
     WHERE f.id = p_funcionario AND f.projeto_id IN (SELECT public.rh_projetos_do_usuario()));
$fn$;

CREATE OR REPLACE FUNCTION public.rh_gestor_da_admissao(p_admissao uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_e_gestor() AND EXISTS (
    SELECT 1 FROM public.rh_admissoes a
     WHERE a.id = p_admissao AND a.projeto_id IN (SELECT public.rh_projetos_do_usuario()));
$fn$;

-- Qual candidato é o usuário logado (área do candidato, Etapa 4).
CREATE OR REPLACE FUNCTION public.rh_candidato_atual()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT c.id FROM public.rh_candidatos c WHERE c.auth_user_id = auth.uid() AND c.ativo LIMIT 1;
$fn$;

-- ------------------------------------------------------------
-- 4.2) Vagas
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.rh_vagas TO authenticated;
GRANT ALL ON public.rh_vagas TO service_role;
REVOKE ALL ON public.rh_vagas FROM anon;
ALTER TABLE public.rh_vagas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rh_vagas leitura"   ON public.rh_vagas;
DROP POLICY IF EXISTS "rh_vagas insercao"  ON public.rh_vagas;
DROP POLICY IF EXISTS "rh_vagas alteracao" ON public.rh_vagas;

-- A condição do gestor é escrita inline (e não com rh_gestor_da_vaga)
-- porque uma policy da própria rh_vagas que consultasse rh_vagas seria
-- recursiva.
CREATE POLICY "rh_vagas leitura" ON public.rh_vagas
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND projeto_id IN (SELECT public.rh_projetos_do_usuario()))
  );

CREATE POLICY "rh_vagas insercao" ON public.rh_vagas
  FOR INSERT TO authenticated
  WITH CHECK (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND projeto_id IN (SELECT public.rh_projetos_do_usuario())
        AND status IN ('rascunho', 'aguardando_aprovacao'))
  );

-- O gestor edita a requisição dele enquanto ela não foi aprovada.
CREATE POLICY "rh_vagas alteracao" ON public.rh_vagas
  FOR UPDATE TO authenticated
  USING (
    public.rh_pode_editar()
    OR (public.rh_e_gestor() AND projeto_id IN (SELECT public.rh_projetos_do_usuario())
        AND status IN ('rascunho', 'aguardando_aprovacao'))
  )
  WITH CHECK (
    public.rh_pode_editar()
    OR (public.rh_e_gestor() AND projeto_id IN (SELECT public.rh_projetos_do_usuario())
        AND status IN ('rascunho', 'aguardando_aprovacao'))
  );

GRANT SELECT, INSERT, UPDATE ON public.rh_vaga_faixa TO authenticated;
GRANT ALL ON public.rh_vaga_faixa TO service_role;
REVOKE ALL ON public.rh_vaga_faixa FROM anon;
ALTER TABLE public.rh_vaga_faixa ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_vaga_faixa leitura" ON public.rh_vaga_faixa;
DROP POLICY IF EXISTS "rh_vaga_faixa escrita" ON public.rh_vaga_faixa;
CREATE POLICY "rh_vaga_faixa leitura" ON public.rh_vaga_faixa
  FOR SELECT TO authenticated USING (public.rh_ve_remuneracao());
CREATE POLICY "rh_vaga_faixa escrita" ON public.rh_vaga_faixa
  FOR ALL TO authenticated USING (public.rh_ve_remuneracao()) WITH CHECK (public.rh_ve_remuneracao());

-- ------------------------------------------------------------
-- 4.3) Candidatos, candidaturas, avaliações, anexos
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.rh_candidatos TO authenticated;
GRANT ALL ON public.rh_candidatos TO service_role;
REVOKE ALL ON public.rh_candidatos FROM anon;
ALTER TABLE public.rh_candidatos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_candidatos leitura"   ON public.rh_candidatos;
DROP POLICY IF EXISTS "rh_candidatos insercao"  ON public.rh_candidatos;
DROP POLICY IF EXISTS "rh_candidatos alteracao" ON public.rh_candidatos;
CREATE POLICY "rh_candidatos leitura" ON public.rh_candidatos
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR auth_user_id = auth.uid() OR public.rh_gestor_do_candidato(id));
CREATE POLICY "rh_candidatos insercao" ON public.rh_candidatos
  FOR INSERT TO authenticated WITH CHECK (public.rh_pode_editar());
CREATE POLICY "rh_candidatos alteracao" ON public.rh_candidatos
  FOR UPDATE TO authenticated
  USING (public.rh_pode_editar() OR auth_user_id = auth.uid())
  WITH CHECK (public.rh_pode_editar() OR auth_user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.rh_candidato_pretensao TO authenticated;
GRANT ALL ON public.rh_candidato_pretensao TO service_role;
REVOKE ALL ON public.rh_candidato_pretensao FROM anon;
ALTER TABLE public.rh_candidato_pretensao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_candidato_pretensao leitura" ON public.rh_candidato_pretensao;
DROP POLICY IF EXISTS "rh_candidato_pretensao escrita" ON public.rh_candidato_pretensao;
CREATE POLICY "rh_candidato_pretensao leitura" ON public.rh_candidato_pretensao
  FOR SELECT TO authenticated USING (public.rh_ve_remuneracao());
CREATE POLICY "rh_candidato_pretensao escrita" ON public.rh_candidato_pretensao
  FOR ALL TO authenticated USING (public.rh_ve_remuneracao()) WITH CHECK (public.rh_ve_remuneracao());

GRANT SELECT, INSERT, UPDATE ON public.rh_candidaturas TO authenticated;
GRANT ALL ON public.rh_candidaturas TO service_role;
REVOKE ALL ON public.rh_candidaturas FROM anon;
ALTER TABLE public.rh_candidaturas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_candidaturas leitura"   ON public.rh_candidaturas;
DROP POLICY IF EXISTS "rh_candidaturas insercao"  ON public.rh_candidaturas;
DROP POLICY IF EXISTS "rh_candidaturas alteracao" ON public.rh_candidaturas;
CREATE POLICY "rh_candidaturas leitura" ON public.rh_candidaturas
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR public.rh_gestor_da_vaga(vaga_id)
    OR candidato_id = public.rh_candidato_atual()
  );
CREATE POLICY "rh_candidaturas insercao" ON public.rh_candidaturas
  FOR INSERT TO authenticated WITH CHECK (public.rh_pode_editar());
CREATE POLICY "rh_candidaturas alteracao" ON public.rh_candidaturas
  FOR UPDATE TO authenticated
  USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar());

GRANT SELECT, INSERT, UPDATE ON public.rh_avaliacoes TO authenticated;
GRANT ALL ON public.rh_avaliacoes TO service_role;
REVOKE ALL ON public.rh_avaliacoes FROM anon;
ALTER TABLE public.rh_avaliacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_avaliacoes leitura"   ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "rh_avaliacoes insercao"  ON public.rh_avaliacoes;
DROP POLICY IF EXISTS "rh_avaliacoes alteracao" ON public.rh_avaliacoes;
-- Candidato NUNCA lê parecer (briefing, área do candidato).
CREATE POLICY "rh_avaliacoes leitura" ON public.rh_avaliacoes
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR avaliador_id = auth.uid() OR public.rh_gestor_da_candidatura(candidatura_id));
CREATE POLICY "rh_avaliacoes insercao" ON public.rh_avaliacoes
  FOR INSERT TO authenticated
  WITH CHECK (public.rh_pode_editar() OR public.rh_gestor_da_candidatura(candidatura_id));
CREATE POLICY "rh_avaliacoes alteracao" ON public.rh_avaliacoes
  FOR UPDATE TO authenticated
  USING (public.rh_pode_editar() OR avaliador_id = auth.uid())
  WITH CHECK (public.rh_pode_editar() OR avaliador_id = auth.uid());

GRANT SELECT, INSERT, UPDATE ON public.rh_candidato_anexos TO authenticated;
GRANT ALL ON public.rh_candidato_anexos TO service_role;
REVOKE ALL ON public.rh_candidato_anexos FROM anon;
ALTER TABLE public.rh_candidato_anexos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_candidato_anexos leitura"   ON public.rh_candidato_anexos;
DROP POLICY IF EXISTS "rh_candidato_anexos insercao"  ON public.rh_candidato_anexos;
DROP POLICY IF EXISTS "rh_candidato_anexos alteracao" ON public.rh_candidato_anexos;
CREATE POLICY "rh_candidato_anexos leitura" ON public.rh_candidato_anexos
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR candidato_id = public.rh_candidato_atual() OR public.rh_gestor_do_candidato(candidato_id));
CREATE POLICY "rh_candidato_anexos insercao" ON public.rh_candidato_anexos
  FOR INSERT TO authenticated
  WITH CHECK (public.rh_pode_editar() OR candidato_id = public.rh_candidato_atual());
CREATE POLICY "rh_candidato_anexos alteracao" ON public.rh_candidato_anexos
  FOR UPDATE TO authenticated
  USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar());

-- ------------------------------------------------------------
-- 4.4) Admissões
-- ------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.rh_admissoes TO authenticated;
GRANT ALL ON public.rh_admissoes TO service_role;
REVOKE ALL ON public.rh_admissoes FROM anon;
ALTER TABLE public.rh_admissoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_admissoes leitura"   ON public.rh_admissoes;
DROP POLICY IF EXISTS "rh_admissoes insercao"  ON public.rh_admissoes;
DROP POLICY IF EXISTS "rh_admissoes alteracao" ON public.rh_admissoes;
CREATE POLICY "rh_admissoes leitura" ON public.rh_admissoes
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR public.rh_gestor_da_admissao(id)
    OR candidato_id = public.rh_candidato_atual()
  );
CREATE POLICY "rh_admissoes insercao" ON public.rh_admissoes
  FOR INSERT TO authenticated WITH CHECK (public.rh_pode_admissao());
CREATE POLICY "rh_admissoes alteracao" ON public.rh_admissoes
  FOR UPDATE TO authenticated
  USING (public.rh_pode_admissao()) WITH CHECK (public.rh_pode_admissao());

GRANT SELECT, INSERT, UPDATE ON public.rh_admissao_proposta TO authenticated;
GRANT ALL ON public.rh_admissao_proposta TO service_role;
REVOKE ALL ON public.rh_admissao_proposta FROM anon;
ALTER TABLE public.rh_admissao_proposta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_admissao_proposta leitura" ON public.rh_admissao_proposta;
DROP POLICY IF EXISTS "rh_admissao_proposta escrita" ON public.rh_admissao_proposta;
CREATE POLICY "rh_admissao_proposta leitura" ON public.rh_admissao_proposta
  FOR SELECT TO authenticated USING (public.rh_ve_remuneracao());
CREATE POLICY "rh_admissao_proposta escrita" ON public.rh_admissao_proposta
  FOR ALL TO authenticated USING (public.rh_ve_remuneracao()) WITH CHECK (public.rh_ve_remuneracao());

GRANT SELECT, INSERT, UPDATE ON public.rh_admissao_itens TO authenticated;
GRANT ALL ON public.rh_admissao_itens TO service_role;
REVOKE ALL ON public.rh_admissao_itens FROM anon;
ALTER TABLE public.rh_admissao_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_admissao_itens leitura"   ON public.rh_admissao_itens;
DROP POLICY IF EXISTS "rh_admissao_itens insercao"  ON public.rh_admissao_itens;
DROP POLICY IF EXISTS "rh_admissao_itens alteracao" ON public.rh_admissao_itens;
CREATE POLICY "rh_admissao_itens leitura" ON public.rh_admissao_itens
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR public.rh_gestor_da_admissao(admissao_id)
    OR (public.rh_e_almoxarifado() AND categoria = 'epi')
    OR EXISTS (SELECT 1 FROM public.rh_admissoes a
                WHERE a.id = admissao_id AND a.candidato_id = public.rh_candidato_atual())
  );
CREATE POLICY "rh_admissao_itens insercao" ON public.rh_admissao_itens
  FOR INSERT TO authenticated WITH CHECK (public.rh_pode_admissao());
-- O candidato só mexe no item que é dele para enviar; a conferência
-- (status aprovado/reprovado) é validada por trigger, no bloco 5.
CREATE POLICY "rh_admissao_itens alteracao" ON public.rh_admissao_itens
  FOR UPDATE TO authenticated
  USING (
    public.rh_pode_admissao()
    OR (public.rh_e_almoxarifado() AND categoria = 'epi')
    OR (responsavel = 'candidato' AND EXISTS (SELECT 1 FROM public.rh_admissoes a
          WHERE a.id = admissao_id AND a.candidato_id = public.rh_candidato_atual()))
  )
  WITH CHECK (
    public.rh_pode_admissao()
    OR (public.rh_e_almoxarifado() AND categoria = 'epi')
    OR (responsavel = 'candidato' AND EXISTS (SELECT 1 FROM public.rh_admissoes a
          WHERE a.id = admissao_id AND a.candidato_id = public.rh_candidato_atual()))
  );

-- ------------------------------------------------------------
-- 4.5) Colaboradores
-- ------------------------------------------------------------
-- FECHA O VAZAMENTO ENCONTRADO NO BANCO: funcionarios, epis e as
-- entregas estavam legíveis por `anon`, com policy USING (true).
REVOKE ALL ON public.funcionarios      FROM anon;
REVOKE ALL ON public.epis              FROM anon;
REVOKE ALL ON public.entregas_epi      FROM anon;
REVOKE ALL ON public.entrega_epi_itens FROM anon;

DROP POLICY IF EXISTS "funcionarios leitura"            ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios escrita autenticada" ON public.funcionarios;
DROP POLICY IF EXISTS "funcionarios escrita"            ON public.funcionarios;
CREATE POLICY "funcionarios leitura" ON public.funcionarios
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR public.rh_e_almoxarifado()
    OR (public.rh_e_gestor() AND (projeto_id IS NULL OR projeto_id IN (SELECT public.rh_projetos_do_usuario())))
  );
-- Almoxarifado continua cadastrando colaborador pela tela de EPIs, que
-- é anterior a este módulo e depende disso.
CREATE POLICY "funcionarios escrita" ON public.funcionarios
  FOR ALL TO authenticated
  USING (public.rh_pode_editar() OR public.rh_e_almoxarifado())
  WITH CHECK (public.rh_pode_editar() OR public.rh_e_almoxarifado());

DROP POLICY IF EXISTS "epis leitura" ON public.epis;
CREATE POLICY "epis leitura" ON public.epis
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "entregas_epi leitura" ON public.entregas_epi;
CREATE POLICY "entregas_epi leitura" ON public.entregas_epi
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "entrega_epi_itens leitura" ON public.entrega_epi_itens;
CREATE POLICY "entrega_epi_itens leitura" ON public.entrega_epi_itens
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);

-- Regra 12 aplicada ao colaborador: quem já tem vida no RH não some.
CREATE OR REPLACE FUNCTION public.rh_protege_funcionario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.rh_funcionario_historico h WHERE h.funcionario_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.rh_funcionario_documentos d WHERE d.funcionario_id = OLD.id)
     OR EXISTS (SELECT 1 FROM public.rh_admissoes a WHERE a.funcionario_id = OLD.id) THEN
    RAISE EXCEPTION 'Colaborador com histórico de RH não pode ser excluído. Marque como inativo (regra 12).'
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_funcionarios_protege ON public.funcionarios;
CREATE TRIGGER trg_funcionarios_protege
  BEFORE DELETE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.rh_protege_funcionario();

GRANT SELECT, INSERT, UPDATE ON public.rh_funcionario_remuneracao TO authenticated;
GRANT ALL ON public.rh_funcionario_remuneracao TO service_role;
REVOKE ALL ON public.rh_funcionario_remuneracao FROM anon;
ALTER TABLE public.rh_funcionario_remuneracao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_remuneracao leitura" ON public.rh_funcionario_remuneracao;
DROP POLICY IF EXISTS "rh_remuneracao escrita" ON public.rh_funcionario_remuneracao;
CREATE POLICY "rh_remuneracao leitura" ON public.rh_funcionario_remuneracao
  FOR SELECT TO authenticated USING (public.rh_ve_remuneracao());
CREATE POLICY "rh_remuneracao escrita" ON public.rh_funcionario_remuneracao
  FOR ALL TO authenticated USING (public.rh_ve_remuneracao()) WITH CHECK (public.rh_ve_remuneracao());

GRANT SELECT, INSERT, UPDATE ON public.rh_funcionario_documentos TO authenticated;
GRANT ALL ON public.rh_funcionario_documentos TO service_role;
REVOKE ALL ON public.rh_funcionario_documentos FROM anon;
ALTER TABLE public.rh_funcionario_documentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_func_docs leitura" ON public.rh_funcionario_documentos;
DROP POLICY IF EXISTS "rh_func_docs escrita" ON public.rh_funcionario_documentos;
CREATE POLICY "rh_func_docs leitura" ON public.rh_funcionario_documentos
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR public.rh_e_almoxarifado() OR public.rh_gestor_do_funcionario(funcionario_id));
CREATE POLICY "rh_func_docs escrita" ON public.rh_funcionario_documentos
  FOR ALL TO authenticated
  USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar());

GRANT SELECT, INSERT, UPDATE ON public.rh_funcionario_dependentes TO authenticated;
GRANT ALL ON public.rh_funcionario_dependentes TO service_role;
REVOKE ALL ON public.rh_funcionario_dependentes FROM anon;
ALTER TABLE public.rh_funcionario_dependentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "rh_dependentes leitura" ON public.rh_funcionario_dependentes;
DROP POLICY IF EXISTS "rh_dependentes escrita" ON public.rh_funcionario_dependentes;
CREATE POLICY "rh_dependentes leitura" ON public.rh_funcionario_dependentes
  FOR SELECT TO authenticated USING (public.rh_pode_ler());
CREATE POLICY "rh_dependentes escrita" ON public.rh_funcionario_dependentes
  FOR ALL TO authenticated USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar());

-- ------------------------------------------------------------
-- 4.6) Históricos: imutáveis para todo mundo, inclusive administrador
-- ------------------------------------------------------------
DO $blk$
DECLARE
  t text;
  cond text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rh_vaga_historico', 'rh_candidatura_historico',
    'rh_admissao_historico', 'rh_funcionario_historico'
  ] LOOP
    -- Sem UPDATE e sem DELETE no GRANT: nem chega a testar policy.
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s leitura" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s insercao" ON public.%I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s leitura" ON public.%I FOR SELECT TO authenticated
      USING (public.rh_pode_ler() OR public.rh_e_gestor())
    $pol$, t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s insercao" ON public.%I FOR INSERT TO authenticated
      WITH CHECK (auth.uid() IS NOT NULL)
    $pol$, t, t);
    -- E o cinto de segurança: mesmo com GRANT restaurado por engano,
    -- a trigger recusa.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_imutavel ON public.%I', t, t);
    EXECUTE format($trg$
      CREATE TRIGGER trg_%s_imutavel BEFORE UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.rh_bloqueia_alteracao()
    $trg$, t, t);
  END LOOP;
END;
$blk$;

-- ------------------------------------------------------------
-- 4.7) updated_at nas tabelas novas do módulo
-- ------------------------------------------------------------
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'rh_vagas', 'rh_vaga_faixa', 'rh_candidatos', 'rh_candidato_pretensao',
    'rh_candidaturas', 'rh_avaliacoes', 'rh_admissoes', 'rh_admissao_proposta',
    'rh_admissao_itens', 'rh_funcionario_remuneracao', 'rh_funcionario_documentos',
    'rh_funcionario_dependentes'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated ON public.%I', t, t);
    EXECUTE format($trg$
      CREATE TRIGGER trg_%s_updated BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at()
    $trg$, t, t);
  END LOOP;
END;
$blk$;

COMMIT;
-- ============================================================
-- 5) Regras de negócio no banco: códigos, guardas, aptidão e views
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 5.1) Vaga: código, slug e guarda de status
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rh_vaga_antes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.codigo, '') = '' THEN
      NEW.codigo := public.rh_proximo_codigo('VAGA');
    END IF;
    IF NEW.solicitante_id IS NULL THEN
      NEW.solicitante_id := auth.uid();
    END IF;
    -- Sem isto, dava para nascer uma vaga já "publicada" e pular a
    -- aprovação da Diretoria inteira. Vaga nasce no começo do fluxo.
    IF NEW.status NOT IN ('rascunho', 'aguardando_aprovacao') THEN
      RAISE EXCEPTION 'Vaga nova nasce como rascunho ou aguardando aprovação. Aprovar e publicar são passos à parte.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    -- Regra 1: status não muda sem nota, e nota só existe dentro de
    -- rh_mover_vaga(). UPDATE direto pela API é recusado aqui.
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.rh_em_movimentacao() THEN
      RAISE EXCEPTION 'O status da vaga só muda por rh_mover_vaga(), que exige nota escrita.'
        USING ERRCODE = '42501';
    END IF;
    IF NEW.publicada_site IS DISTINCT FROM OLD.publicada_site AND NOT public.rh_em_movimentacao() THEN
      RAISE EXCEPTION 'A publicação no site só muda por rh_publicar_vaga() ou rh_despublicar_vaga().'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Regra 3: no site só o que está publicado.
  IF NEW.publicada_site AND NEW.status <> 'publicada' THEN
    RAISE EXCEPTION 'Vaga no site precisa estar com status "publicada".' USING ERRCODE = '23514';
  END IF;
  IF NEW.publicada_site AND NEW.slug IS NULL THEN
    NEW.slug := public.rh_slug(NEW.titulo) || '-' || lower(NEW.codigo);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_vagas_antes ON public.rh_vagas;
CREATE TRIGGER trg_rh_vagas_antes
  BEFORE INSERT OR UPDATE ON public.rh_vagas
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_vaga_antes();

-- ------------------------------------------------------------
-- 5.2) Candidatura: guarda de etapa/status (regra 1)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rh_candidatura_guarda()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Inscrever alguém já como "contratado" seria a forma mais curta de
    -- furar a regra 5. A candidatura entra sempre em etapa inicial.
    IF NEW.status <> 'em_andamento' AND NOT public.rh_em_movimentacao() THEN
      RAISE EXCEPTION 'Candidatura nova entra como em andamento, na etapa inicial do funil.'
        USING ERRCODE = '23514';
    END IF;
    IF NOT public.rh_em_movimentacao()
       AND NOT EXISTS (SELECT 1 FROM public.rh_funil_etapas e
                        WHERE e.id = NEW.etapa_id AND e.tipo = 'inicial') THEN
      RAISE EXCEPTION 'Candidatura nova entra pela etapa inicial do funil, não por uma etapa no meio.'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF (NEW.etapa_id IS DISTINCT FROM OLD.etapa_id OR NEW.status IS DISTINCT FROM OLD.status)
     AND NOT public.rh_em_movimentacao() THEN
    RAISE EXCEPTION 'Mover candidato de etapa só por rh_mover_candidatura(), que grava a nota obrigatória na mesma transação.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_candidaturas_guarda ON public.rh_candidaturas;
CREATE TRIGGER trg_rh_candidaturas_guarda
  BEFORE INSERT OR UPDATE ON public.rh_candidaturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_candidatura_guarda();

-- ------------------------------------------------------------
-- 5.3) Regra 4: vaga com todas as posições preenchidas encerra sozinha
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rh_vaga_preenchimento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_vaga   uuid;
  v_qtd    int;
  v_pos    int;
  v_status text;
BEGIN
  v_vaga := CASE WHEN TG_OP = 'DELETE' THEN OLD.vaga_id ELSE NEW.vaga_id END;

  SELECT count(*) INTO v_qtd
    FROM public.rh_candidaturas c
   WHERE c.vaga_id = v_vaga AND c.status = 'contratado';

  SELECT v.quantidade_posicoes, v.status INTO v_pos, v_status
    FROM public.rh_vagas v WHERE v.id = v_vaga;
  IF NOT FOUND THEN RETURN NULL; END IF;

  PERFORM set_config('rh.movimentacao', 'on', true);

  UPDATE public.rh_vagas v
     SET quantidade_preenchida = v_qtd,
         status = CASE WHEN v_qtd >= v_pos AND v_status NOT IN ('encerrada', 'cancelada')
                       THEN 'encerrada' ELSE v.status END,
         publicada_site = CASE WHEN v_qtd >= v_pos THEN false ELSE v.publicada_site END,
         data_encerramento = CASE WHEN v_qtd >= v_pos AND v.data_encerramento IS NULL
                                  THEN CURRENT_DATE ELSE v.data_encerramento END
   WHERE v.id = v_vaga;

  IF v_qtd >= v_pos AND v_status NOT IN ('encerrada', 'cancelada') THEN
    INSERT INTO public.rh_vaga_historico (vaga_id, status_anterior, status_novo, nota, autor_id, autor_nome)
    VALUES (v_vaga, v_status, 'encerrada',
            'Encerrada automaticamente pelo sistema: todas as posições foram preenchidas.',
            auth.uid(), 'Sistema');
  END IF;

  PERFORM set_config('rh.movimentacao', 'off', true);
  RETURN NULL;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_candidaturas_preenchimento ON public.rh_candidaturas;
CREATE TRIGGER trg_rh_candidaturas_preenchimento
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_candidaturas
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_vaga_preenchimento();

-- ------------------------------------------------------------
-- 5.4) Admissão: código e guarda de status; conferência de item
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_rh_admissao_antes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.codigo, '') = '' THEN
      NEW.codigo := public.rh_proximo_codigo('ADM');
    END IF;
    IF NEW.responsavel_id IS NULL THEN NEW.responsavel_id := auth.uid(); END IF;
    -- Mesma brecha da vaga: admissão não pode nascer concluída, senão
    -- o checklist inteiro (regras 5 e 6) vira decoração.
    IF NEW.status = 'concluida' THEN
      RAISE EXCEPTION 'Admissão não nasce concluída. Conclua por rh_concluir_admissao(), que confere o checklist.'
        USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW.status IS DISTINCT FROM OLD.status AND NOT public.rh_em_movimentacao() THEN
      RAISE EXCEPTION 'O status da admissão só muda por rh_mover_admissao() ou rh_concluir_admissao(), que exigem nota.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_admissoes_antes ON public.rh_admissoes;
CREATE TRIGGER trg_rh_admissoes_antes
  BEFORE INSERT OR UPDATE ON public.rh_admissoes
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_admissao_antes();

CREATE OR REPLACE FUNCTION public.tg_rh_admissao_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('aprovado', 'reprovado', 'dispensado') THEN
    -- O almoxarifado fecha o item de EPI: é ele quem entrega e colhe a
    -- assinatura do termo. Sem isso o checklist nunca fecharia.
    IF NOT (public.rh_pode_admissao()
            OR (public.rh_e_almoxarifado() AND NEW.categoria = 'epi')) THEN
      RAISE EXCEPTION 'Conferir item de admissão é do RH, da Diretoria ou do Administrativo.'
        USING ERRCODE = '42501';
    END IF;
    NEW.conferido_por_id := auth.uid();
    NEW.conferido_em := now();
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_rh_admissao_itens_conferencia ON public.rh_admissao_itens;
CREATE TRIGGER trg_rh_admissao_itens_conferencia
  BEFORE UPDATE ON public.rh_admissao_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_admissao_item();

-- ------------------------------------------------------------
-- 5.5) Aptidão para alocação (regras 8 e 9)
-- ------------------------------------------------------------
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

  -- Exame ocupacional obrigatório + toda NR que o cargo exige.
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

  -- EPI padrão do cargo, entregue e com termo assinado.
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
COMMENT ON FUNCTION public.rh_pendencias_alocacao(uuid) IS
  'Lista, em texto, exatamente o que falta para o colaborador entrar em obra. Vazio = apto (regra 8).';

CREATE OR REPLACE FUNCTION public.rh_recalcula_aptidao(p_funcionario uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_apto boolean;
BEGIN
  IF p_funcionario IS NULL THEN RETURN false; END IF;
  v_apto := coalesce(array_length(public.rh_pendencias_alocacao(p_funcionario), 1), 0) = 0;
  UPDATE public.funcionarios SET apto_alocacao = v_apto
   WHERE id = p_funcionario AND apto_alocacao IS DISTINCT FROM v_apto;
  RETURN v_apto;
END;
$fn$;

-- Roda todo dia (job externo ou botão do painel): é o que faz documento
-- vencido derrubar a aptidão sem ninguém mexer em nada (regra 9).
CREATE OR REPLACE FUNCTION public.rh_recalcula_aptidao_todos()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_n int := 0; r record;
BEGIN
  FOR r IN SELECT id FROM public.funcionarios WHERE ativo LOOP
    PERFORM public.rh_recalcula_aptidao(r.id);
    v_n := v_n + 1;
  END LOOP;
  -- Situação dos documentos também é recarimbada aqui.
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

CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_documento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.rh_recalcula_aptidao(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.funcionario_id ELSE NEW.funcionario_id END);
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_rh_func_docs_aptidao ON public.rh_funcionario_documentos;
CREATE TRIGGER trg_rh_func_docs_aptidao
  AFTER INSERT OR UPDATE OR DELETE ON public.rh_funcionario_documentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_aptidao_documento();

CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_entrega()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.rh_recalcula_aptidao(
    CASE WHEN TG_OP = 'DELETE' THEN OLD.funcionario_id ELSE NEW.funcionario_id END);
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_entregas_epi_aptidao ON public.entregas_epi;
CREATE TRIGGER trg_entregas_epi_aptidao
  AFTER INSERT OR UPDATE OR DELETE ON public.entregas_epi
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_aptidao_entrega();

CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_entrega_item()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_func uuid;
BEGIN
  SELECT en.funcionario_id INTO v_func FROM public.entregas_epi en
   WHERE en.id = CASE WHEN TG_OP = 'DELETE' THEN OLD.entrega_id ELSE NEW.entrega_id END;
  IF v_func IS NOT NULL THEN PERFORM public.rh_recalcula_aptidao(v_func); END IF;
  RETURN NULL;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_entrega_itens_aptidao ON public.entrega_epi_itens;
CREATE TRIGGER trg_entrega_itens_aptidao
  AFTER INSERT OR UPDATE OR DELETE ON public.entrega_epi_itens
  FOR EACH ROW EXECUTE FUNCTION public.tg_rh_aptidao_entrega_item();

CREATE OR REPLACE FUNCTION public.tg_rh_aptidao_funcionario()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  PERFORM public.rh_recalcula_aptidao(NEW.id);
  RETURN NULL;
END;
$fn$;
-- O WHEN é o que evita recursão: o UPDATE que a função faz mexe só em
-- apto_alocacao, e essa coluna não está na condição.
DROP TRIGGER IF EXISTS trg_funcionarios_aptidao ON public.funcionarios;
CREATE TRIGGER trg_funcionarios_aptidao
  AFTER UPDATE ON public.funcionarios
  FOR EACH ROW
  WHEN (OLD.cargo_id IS DISTINCT FROM NEW.cargo_id OR OLD.situacao IS DISTINCT FROM NEW.situacao)
  EXECUTE FUNCTION public.tg_rh_aptidao_funcionario();

-- ------------------------------------------------------------
-- 5.6) Views de apoio
-- ------------------------------------------------------------
-- Todas com security_invoker = true: a view não afrouxa nada, quem
-- decide o que aparece continua sendo a RLS das tabelas de baixo.
-- A única exceção é vw_rh_vagas_publicas, no fim do bloco.

DROP VIEW IF EXISTS public.vw_rh_funil;
CREATE VIEW public.vw_rh_funil WITH (security_invoker = true) AS
SELECT
  c.id                        AS candidatura_id,
  c.candidato_id,
  c.vaga_id,
  c.etapa_id,
  c.status,
  c.data_inscricao,
  c.data_ultima_movimentacao,
  c.score,
  c.responsavel_id,
  c.origem,
  c.admissao_id,
  cand.nome                   AS candidato_nome,
  cand.cidade,
  cand.uf,
  cand.cargo_pretendido,
  cand.telefone,
  cand.whatsapp,
  cand.email,
  cand.nrs_declaradas,
  cand.foto_path,
  cand.curriculo_path,
  cand.disponibilidade,
  cand.status                 AS candidato_status,
  v.codigo                    AS vaga_codigo,
  v.titulo                    AS vaga_titulo,
  v.projeto_id,
  v.cargo_id,
  v.status                    AS vaga_status,
  e.nome                      AS etapa_nome,
  e.ordem                     AS etapa_ordem,
  e.tipo                      AS etapa_tipo,
  e.sla_dias,
  e.cor                       AS etapa_cor,
  GREATEST(0, (CURRENT_DATE - c.data_ultima_movimentacao::date)) AS dias_na_etapa,
  CASE
    WHEN e.tipo IN ('final_positiva', 'final_negativa', 'final_neutra') THEN 'neutro'
    WHEN e.sla_dias <= 0 THEN 'neutro'
    WHEN (CURRENT_DATE - c.data_ultima_movimentacao::date) <= e.sla_dias THEN 'neutro'
    WHEN (CURRENT_DATE - c.data_ultima_movimentacao::date) <= e.sla_dias * 2 THEN 'alerta'
    ELSE 'critico'
  END AS semaforo
FROM public.rh_candidaturas c
JOIN public.rh_candidatos    cand ON cand.id = c.candidato_id
JOIN public.rh_vagas         v    ON v.id = c.vaga_id
JOIN public.rh_funil_etapas  e    ON e.id = c.etapa_id
WHERE c.ativo;
COMMENT ON VIEW public.vw_rh_funil IS
  'Kanban do funil. dias_na_etapa e semaforo (neutro/alerta/critico) vêm daqui — a tela não recalcula (regra 15).';

DROP VIEW IF EXISTS public.vw_rh_documentos_vencimento;
CREATE VIEW public.vw_rh_documentos_vencimento WITH (security_invoker = true) AS
SELECT
  d.id                AS documento_id,
  d.funcionario_id,
  f.nome              AS funcionario_nome,
  f.matricula,
  f.cargo,
  f.setor,
  f.projeto_id,
  f.situacao,
  d.tipo_documento_id,
  td.nome             AS tipo_nome,
  td.categoria        AS tipo_categoria,
  td.bloqueia_alocacao,
  d.numero,
  d.data_emissao,
  d.data_vencimento,
  d.arquivo_path,
  CASE WHEN d.data_vencimento IS NULL THEN NULL
       ELSE (d.data_vencimento - CURRENT_DATE) END AS dias_para_vencer,
  CASE
    WHEN d.data_vencimento IS NULL                      THEN 'sem_vencimento'
    WHEN d.data_vencimento <  CURRENT_DATE              THEN 'vencido'
    WHEN d.data_vencimento <= CURRENT_DATE + 7          THEN 'critico'
    WHEN d.data_vencimento <= CURRENT_DATE + 30         THEN 'a_vencer'
    ELSE 'valido'
  END AS situacao_documento
FROM public.rh_funcionario_documentos d
JOIN public.funcionarios       f  ON f.id = d.funcionario_id
JOIN public.rh_tipos_documento td ON td.id = d.tipo_documento_id
WHERE d.ativo AND d.status <> 'substituido';
COMMENT ON VIEW public.vw_rh_documentos_vencimento IS
  'Alerta de vencimento em 30, 15 e 7 dias (regra 9). Situação calculada na leitura, não guardada.';

DROP VIEW IF EXISTS public.vw_rh_alocacao;
CREATE VIEW public.vw_rh_alocacao WITH (security_invoker = true) AS
SELECT
  f.id AS funcionario_id,
  f.nome,
  f.matricula,
  f.cargo,
  f.cargo_id,
  f.setor,
  f.projeto_id,
  f.situacao,
  f.ativo,
  public.rh_pendencias_alocacao(f.id) AS pendencias,
  coalesce(array_length(public.rh_pendencias_alocacao(f.id), 1), 0) = 0 AS apto
FROM public.funcionarios f
WHERE f.ativo;
COMMENT ON VIEW public.vw_rh_alocacao IS
  'Quem pode entrar em obra e, para quem não pode, o que falta — em texto, item a item (regra 8).';

DROP VIEW IF EXISTS public.vw_rh_headcount;
CREATE VIEW public.vw_rh_headcount WITH (security_invoker = true) AS
SELECT
  f.projeto_id,
  f.setor,
  f.cargo_id,
  f.cargo,
  f.tipo_contratacao,
  f.situacao,
  count(*)                                        AS total,
  count(*) FILTER (WHERE f.apto_alocacao)         AS aptos,
  count(*) FILTER (WHERE NOT f.apto_alocacao)     AS inaptos
FROM public.funcionarios f
WHERE f.ativo AND f.situacao <> 'desligado'
GROUP BY f.projeto_id, f.setor, f.cargo_id, f.cargo, f.tipo_contratacao, f.situacao;

-- A única view que roda com os privilégios do dono, porque quem a lê é
-- o site institucional, sem login. Ela mostra só vaga publicada e só
-- devolve faixa salarial quando a vaga não é confidencial (briefing da
-- página /vagas/:slug).
DROP VIEW IF EXISTS public.vw_rh_vagas_publicas;
CREATE VIEW public.vw_rh_vagas_publicas AS
SELECT
  v.id,
  v.codigo,
  v.slug,
  v.titulo,
  v.setor,
  v.tipo_contratacao,
  v.quantidade_posicoes,
  v.jornada,
  v.local_trabalho,
  v.cidade,
  v.uf,
  v.beneficios,
  v.descricao,
  v.requisitos,
  v.diferenciais,
  v.data_abertura,
  v.data_prevista_inicio,
  v.salario_confidencial,
  CASE WHEN v.salario_confidencial THEN NULL ELSE fx.minimo END AS faixa_salarial_min,
  CASE WHEN v.salario_confidencial THEN NULL ELSE fx.maximo END AS faixa_salarial_max
FROM public.rh_vagas v
LEFT JOIN public.rh_vaga_faixa fx ON fx.vaga_id = v.id
WHERE v.publicada_site AND v.status = 'publicada' AND v.ativo;

GRANT SELECT ON public.vw_rh_funil                  TO authenticated;
GRANT SELECT ON public.vw_rh_documentos_vencimento  TO authenticated;
GRANT SELECT ON public.vw_rh_alocacao               TO authenticated;
GRANT SELECT ON public.vw_rh_headcount              TO authenticated;
GRANT SELECT ON public.vw_rh_vagas_publicas         TO anon, authenticated;

COMMIT;
-- ============================================================
-- 6) As operações do módulo — é por aqui que o front escreve
-- ------------------------------------------------------------
-- Toda mudança de etapa ou de status passa por uma destas funções.
-- Elas são o único lugar onde a nota é gravada junto com a mudança, na
-- mesma transação; as triggers do bloco 5 recusam qualquer outro
-- caminho. Não existe atalho, nem para o administrador.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.rh_nome_atual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(p.nome, p.email, '') FROM public.profiles p WHERE p.id = auth.uid();
$fn$;

-- ------------------------------------------------------------
-- 6.1) Vaga: mover, aprovar, publicar
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rh_mover_vaga(
  p_vaga   uuid,
  p_status text,
  p_nota   text
) RETURNS public.rh_vagas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old public.rh_vagas;
  v_new public.rh_vagas;
BEGIN
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'A nota da movimentação é obrigatória (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_old FROM public.rh_vagas WHERE id = p_vaga FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vaga não encontrada.' USING ERRCODE = 'P0002'; END IF;

  IF p_status NOT IN ('rascunho', 'aguardando_aprovacao', 'aprovada', 'publicada',
                      'congelada', 'encerrada', 'cancelada') THEN
    RAISE EXCEPTION 'Status de vaga inválido: %', p_status USING ERRCODE = '23514';
  END IF;

  -- Alçada definida com o cliente: TODA vaga é aprovada pela Diretoria.
  IF p_status = 'aprovada' AND NOT public.rh_e_direcao() THEN
    RAISE EXCEPTION 'Só a Diretoria aprova vaga.' USING ERRCODE = '42501';
  END IF;

  -- Publicar tem porta própria, porque exige checagem de conteúdo.
  IF p_status = 'publicada' THEN
    RAISE EXCEPTION 'Para publicar use rh_publicar_vaga(), que confere os campos obrigatórios.' USING ERRCODE = '42501';
  END IF;

  -- O gestor da obra manda a requisição dele para aprovação; o resto é RH.
  IF NOT (public.rh_pode_editar()
          OR (p_status = 'aguardando_aprovacao' AND v_old.status = 'rascunho'
              AND (v_old.solicitante_id = auth.uid() OR public.rh_pode_ler()
                   OR public.rh_gestor_da_vaga(p_vaga)))) THEN
    RAISE EXCEPTION 'Você não tem permissão para mudar o status desta vaga.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_vagas
     SET status = p_status,
         publicada_site = CASE WHEN p_status IN ('congelada', 'encerrada', 'cancelada')
                               THEN false ELSE publicada_site END,
         aprovador_id   = CASE WHEN p_status = 'aprovada' THEN auth.uid() ELSE aprovador_id END,
         data_aprovacao = CASE WHEN p_status = 'aprovada' THEN now() ELSE data_aprovacao END,
         data_encerramento = CASE WHEN p_status IN ('encerrada', 'cancelada') AND data_encerramento IS NULL
                                  THEN CURRENT_DATE ELSE data_encerramento END
   WHERE id = p_vaga
   RETURNING * INTO v_new;

  INSERT INTO public.rh_vaga_historico (vaga_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (p_vaga, v_old.status, p_status, btrim(p_nota), auth.uid(), public.rh_nome_atual());
  PERFORM set_config('rh.movimentacao', 'off', true);

  RETURN v_new;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_publicar_vaga(p_vaga uuid, p_nota text)
RETURNS public.rh_vagas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old public.rh_vagas;
  v_new public.rh_vagas;
  v_falta text[] := '{}';
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Publicar vaga é do RH ou da Diretoria.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'A nota da movimentação é obrigatória (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_old FROM public.rh_vagas WHERE id = p_vaga FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vaga não encontrada.' USING ERRCODE = 'P0002'; END IF;

  -- Regra 3: aprovada pela Diretoria, e com o anúncio de fato escrito.
  IF v_old.status <> 'aprovada' THEN
    RAISE EXCEPTION 'Só vaga aprovada pela Diretoria vai para o site. Status atual: %.', v_old.status
      USING ERRCODE = '23514';
  END IF;
  IF btrim(coalesce(v_old.titulo, '')) = ''         THEN v_falta := v_falta || 'título'; END IF;
  IF v_old.cargo_id IS NULL                          THEN v_falta := v_falta || 'cargo'; END IF;
  IF btrim(coalesce(v_old.descricao, '')) = ''       THEN v_falta := v_falta || 'descrição'; END IF;
  IF btrim(coalesce(v_old.requisitos, '')) = ''      THEN v_falta := v_falta || 'requisitos'; END IF;
  IF btrim(coalesce(v_old.local_trabalho, '')) = ''
     AND btrim(coalesce(v_old.cidade, '')) = ''      THEN v_falta := v_falta || 'local de trabalho'; END IF;
  IF btrim(coalesce(v_old.tipo_contratacao, '')) = '' THEN v_falta := v_falta || 'tipo de contratação'; END IF;
  IF array_length(v_falta, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'Falta preencher para publicar: %.', array_to_string(v_falta, ', ') USING ERRCODE = '23514';
  END IF;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_vagas
     SET status = 'publicada',
         publicada_site = true,
         slug = coalesce(slug, public.rh_slug(titulo) || '-' || lower(codigo))
   WHERE id = p_vaga
   RETURNING * INTO v_new;
  INSERT INTO public.rh_vaga_historico (vaga_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (p_vaga, v_old.status, 'publicada', btrim(p_nota), auth.uid(), public.rh_nome_atual());
  PERFORM set_config('rh.movimentacao', 'off', true);

  RETURN v_new;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_despublicar_vaga(p_vaga uuid, p_nota text)
RETURNS public.rh_vagas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_old public.rh_vagas; v_new public.rh_vagas;
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Despublicar vaga é do RH ou da Diretoria.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'A nota da movimentação é obrigatória (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_old FROM public.rh_vagas WHERE id = p_vaga FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vaga não encontrada.' USING ERRCODE = 'P0002'; END IF;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_vagas SET publicada_site = false, status = 'aprovada'
   WHERE id = p_vaga RETURNING * INTO v_new;
  INSERT INTO public.rh_vaga_historico (vaga_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (p_vaga, v_old.status, 'aprovada', btrim(p_nota), auth.uid(), public.rh_nome_atual());
  PERFORM set_config('rh.movimentacao', 'off', true);
  RETURN v_new;
END;
$fn$;

-- ------------------------------------------------------------
-- 6.2) Funil: a movimentação com nota obrigatória (regras 1, 2 e 5)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rh_mover_candidatura(
  p_candidatura   uuid,
  p_etapa         uuid,
  p_nota          text,
  p_motivo_id     uuid DEFAULT NULL,
  p_motivo_texto  text DEFAULT NULL
) RETURNS public.rh_candidaturas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_old    public.rh_candidaturas;
  v_new    public.rh_candidaturas;
  v_etapa  public.rh_funil_etapas;
  v_status text;
BEGIN
  -- Regra 1. Primeira coisa checada, antes de qualquer escrita.
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'Escreva a nota da movimentação (mínimo 5 caracteres). Sem nota, a etapa não muda.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_old FROM public.rh_candidaturas WHERE id = p_candidatura FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidatura não encontrada.' USING ERRCODE = 'P0002'; END IF;

  SELECT * INTO v_etapa FROM public.rh_funil_etapas WHERE id = p_etapa AND ativo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Etapa do funil inválida ou inativa.' USING ERRCODE = '23514'; END IF;

  -- Quem pode mover: RH e Diretoria sempre; gestor da obra só para as
  -- etapas marcadas como permite_gestor.
  IF NOT (public.rh_pode_editar()
          OR (v_etapa.permite_gestor AND public.rh_gestor_da_candidatura(p_candidatura))) THEN
    RAISE EXCEPTION 'Você não tem permissão para mover este candidato para "%".', v_etapa.nome
      USING ERRCODE = '42501';
  END IF;

  -- Regra 2: reprovar exige motivo do catálogo E texto livre.
  IF v_etapa.tipo = 'final_negativa' THEN
    IF p_motivo_id IS NULL THEN
      RAISE EXCEPTION 'Escolha o motivo no catálogo para encerrar o processo deste candidato.'
        USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.rh_motivos_reprovacao m WHERE m.id = p_motivo_id AND m.ativo) THEN
      RAISE EXCEPTION 'Motivo de reprovação inválido ou inativo.' USING ERRCODE = '23514';
    END IF;
    IF p_motivo_texto IS NULL OR char_length(btrim(p_motivo_texto)) < 5 THEN
      RAISE EXCEPTION 'Além do motivo do catálogo, escreva o que aconteceu (mínimo 5 caracteres).'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Regra 5: ninguém chega em "Contratado" sem admissão concluída.
  IF v_etapa.tipo = 'final_positiva' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.rh_admissoes a
       WHERE a.candidatura_id = p_candidatura AND a.status = 'concluida'
    ) THEN
      RAISE EXCEPTION 'Este candidato só vai para "%" com a admissão concluída. Conclua a admissão primeiro.', v_etapa.nome
        USING ERRCODE = '23514';
    END IF;
  END IF;

  v_status := coalesce(v_etapa.status_resultante, 'em_andamento');

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_candidaturas
     SET etapa_id = p_etapa,
         status   = v_status,
         data_ultima_movimentacao = now(),
         motivo_reprovacao_id    = CASE WHEN v_etapa.tipo = 'final_negativa' THEN p_motivo_id ELSE NULL END,
         motivo_reprovacao_texto = CASE WHEN v_etapa.tipo = 'final_negativa' THEN btrim(p_motivo_texto) ELSE NULL END
   WHERE id = p_candidatura
   RETURNING * INTO v_new;

  INSERT INTO public.rh_candidatura_historico
    (candidatura_id, etapa_anterior_id, etapa_nova_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES
    (p_candidatura, v_old.etapa_id, p_etapa, v_old.status, v_status, btrim(p_nota), auth.uid(), public.rh_nome_atual());

  -- O candidato acompanha o estado dele na base única.
  UPDATE public.rh_candidatos c
     SET status = CASE
           WHEN v_status = 'contratado'     THEN 'contratado'
           WHEN v_status = 'banco_talentos' THEN 'banco_talentos'
           WHEN v_status IN ('reprovado', 'desistiu') THEN 'ativo'
           ELSE 'em_processo' END
   WHERE c.id = v_new.candidato_id;

  PERFORM set_config('rh.movimentacao', 'off', true);
  RETURN v_new;
END;
$fn$;

-- Inscrever candidato numa vaga já cai na etapa inicial do funil.
CREATE OR REPLACE FUNCTION public.rh_inscrever_candidato(
  p_candidato uuid,
  p_vaga      uuid,
  p_nota      text DEFAULT 'Inscrição registrada.'
) RETURNS public.rh_candidaturas
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_etapa  uuid;
  v_nova   public.rh_candidaturas;
  v_origem text;
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Inscrever candidato em vaga é do RH ou da Diretoria.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_etapa FROM public.rh_funil_etapas
   WHERE ativo AND tipo = 'inicial' ORDER BY ordem LIMIT 1;
  IF v_etapa IS NULL THEN
    RAISE EXCEPTION 'Nenhuma etapa inicial configurada no funil.' USING ERRCODE = 'P0002';
  END IF;
  SELECT origem INTO v_origem FROM public.rh_candidatos WHERE id = p_candidato;

  INSERT INTO public.rh_candidaturas (candidato_id, vaga_id, etapa_id, origem, responsavel_id)
  VALUES (p_candidato, p_vaga, v_etapa, coalesce(v_origem, 'cadastro_interno'), auth.uid())
  RETURNING * INTO v_nova;

  INSERT INTO public.rh_candidatura_historico
    (candidatura_id, etapa_anterior_id, etapa_nova_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (v_nova.id, NULL, v_etapa, '', 'em_andamento',
          CASE WHEN char_length(btrim(coalesce(p_nota, ''))) >= 5 THEN btrim(p_nota)
               ELSE 'Inscrição registrada no funil.' END,
          auth.uid(), public.rh_nome_atual());

  UPDATE public.rh_candidatos SET status = 'em_processo' WHERE id = p_candidato AND status = 'ativo';
  RETURN v_nova;
END;
$fn$;

-- ------------------------------------------------------------
-- 6.3) Admissão: abrir, mover, concluir
-- ------------------------------------------------------------
-- Monta o checklist a partir do modelo do cargo, somando as NRs que o
-- cargo exige e os EPIs padrão dele (passo 7 do fluxo do briefing).
CREATE OR REPLACE FUNCTION public.rh_gerar_checklist_admissao(p_admissao uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_adm    public.rh_admissoes;
  v_modelo uuid;
  v_nrs    text[] := '{}';
  v_epis   uuid[] := '{}';
  v_n      int := 0;
  v_ordem  int := 0;
  r        record;
BEGIN
  IF NOT public.rh_pode_admissao() THEN
    RAISE EXCEPTION 'Montar checklist de admissão é do RH, da Diretoria ou do Administrativo.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_adm FROM public.rh_admissoes WHERE id = p_admissao;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admissão não encontrada.' USING ERRCODE = 'P0002'; END IF;

  v_modelo := v_adm.checklist_modelo_id;
  IF v_modelo IS NULL AND v_adm.cargo_id IS NOT NULL THEN
    SELECT checklist_modelo_id INTO v_modelo FROM public.rh_cargos WHERE id = v_adm.cargo_id;
  END IF;
  IF v_modelo IS NULL THEN
    SELECT id INTO v_modelo FROM public.rh_checklist_modelos
     WHERE ativo AND tipo_contratacao = v_adm.tipo_contratacao ORDER BY created_at LIMIT 1;
  END IF;

  IF v_adm.cargo_id IS NOT NULL THEN
    SELECT coalesce(nrs_exigidas, '{}'), coalesce(epis_padrao, '{}')
      INTO v_nrs, v_epis FROM public.rh_cargos WHERE id = v_adm.cargo_id;
  END IF;

  IF v_modelo IS NOT NULL THEN
    FOR r IN
      SELECT * FROM public.rh_checklist_modelo_itens
       WHERE modelo_id = v_modelo AND ativo ORDER BY ordem, titulo
    LOOP
      v_ordem := v_ordem + 1;
      INSERT INTO public.rh_admissao_itens
        (admissao_id, titulo, categoria, tipo_documento_id, obrigatorio, responsavel, instrucoes, ordem)
      SELECT p_admissao, r.titulo, r.categoria, r.tipo_documento_id, r.obrigatorio,
             r.responsavel_padrao, r.instrucoes, v_ordem
       WHERE NOT EXISTS (
         SELECT 1 FROM public.rh_admissao_itens i
          WHERE i.admissao_id = p_admissao AND lower(i.titulo) = lower(r.titulo));
      v_n := v_n + 1;
    END LOOP;
  END IF;

  -- NRs do cargo entram mesmo que o modelo não as preveja.
  FOR r IN SELECT td.id, td.nome FROM public.rh_tipos_documento td
            WHERE td.ativo AND td.nome = ANY (v_nrs) ORDER BY td.ordem, td.nome
  LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.rh_admissao_itens
      (admissao_id, titulo, categoria, tipo_documento_id, obrigatorio, responsavel, ordem, instrucoes)
    SELECT p_admissao, r.nome, 'treinamento', r.id, true, 'rh', v_ordem,
           'Exigência do cargo. Anexar o certificado com data de validade.'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.rh_admissao_itens i
        WHERE i.admissao_id = p_admissao AND i.tipo_documento_id = r.id);
    v_n := v_n + 1;
  END LOOP;

  -- EPIs padrão do cargo viram item de checklist do almoxarifado.
  FOR r IN SELECT e.id, e.nome FROM public.epis e WHERE e.id = ANY (v_epis) ORDER BY e.nome
  LOOP
    v_ordem := v_ordem + 1;
    INSERT INTO public.rh_admissao_itens
      (admissao_id, titulo, categoria, obrigatorio, responsavel, ordem, instrucoes)
    SELECT p_admissao, 'Entrega de EPI: ' || r.nome, 'epi', true, 'almoxarifado', v_ordem,
           'Entregar pelo módulo de EPIs e colher a assinatura do termo.'
     WHERE NOT EXISTS (
       SELECT 1 FROM public.rh_admissao_itens i
        WHERE i.admissao_id = p_admissao AND lower(i.titulo) = lower('Entrega de EPI: ' || r.nome));
    v_n := v_n + 1;
  END LOOP;

  RETURN v_n;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.rh_mover_admissao(p_admissao uuid, p_status text, p_nota text)
RETURNS public.rh_admissoes
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_old public.rh_admissoes; v_new public.rh_admissoes;
BEGIN
  IF NOT public.rh_pode_admissao() THEN
    RAISE EXCEPTION 'Conduzir admissão é do RH, da Diretoria ou do Administrativo.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'A nota da movimentação é obrigatória (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;
  IF p_status = 'concluida' THEN
    RAISE EXCEPTION 'Para concluir use rh_concluir_admissao(), que confere o checklist e gera o colaborador.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_old FROM public.rh_admissoes WHERE id = p_admissao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admissão não encontrada.' USING ERRCODE = 'P0002'; END IF;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_admissoes SET status = p_status WHERE id = p_admissao RETURNING * INTO v_new;
  INSERT INTO public.rh_admissao_historico (admissao_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (p_admissao, v_old.status, p_status, btrim(p_nota), auth.uid(), public.rh_nome_atual());
  PERFORM set_config('rh.movimentacao', 'off', true);
  RETURN v_new;
END;
$fn$;

-- O passo 8 do fluxo: checklist fechado, candidato vira colaborador,
-- sem ninguém redigitar nada (regras 5, 6 e 7).
CREATE OR REPLACE FUNCTION public.rh_concluir_admissao(p_admissao uuid, p_nota text)
RETURNS public.funcionarios
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE
  v_adm       public.rh_admissoes;
  v_cand      public.rh_candidatos;
  v_func      public.funcionarios;
  v_cargo     text := '';
  v_pendentes text;
  v_matricula text;
  v_salario   numeric(12,2);
  v_etapa     uuid;
  r           record;
BEGIN
  IF NOT public.rh_pode_admissao() THEN
    RAISE EXCEPTION 'Concluir admissão é do RH, da Diretoria ou do Administrativo.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'A nota da conclusão é obrigatória (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_adm FROM public.rh_admissoes WHERE id = p_admissao FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Admissão não encontrada.' USING ERRCODE = 'P0002'; END IF;
  IF v_adm.status = 'concluida' THEN
    RAISE EXCEPTION 'Esta admissão já foi concluída.' USING ERRCODE = '23505';
  END IF;

  -- Regra 5: nenhum item obrigatório em aberto.
  SELECT string_agg(i.titulo, ', ' ORDER BY i.ordem) INTO v_pendentes
    FROM public.rh_admissao_itens i
   WHERE i.admissao_id = p_admissao AND i.obrigatorio
     AND i.status NOT IN ('aprovado', 'dispensado');
  IF v_pendentes IS NOT NULL THEN
    RAISE EXCEPTION 'Faltam itens obrigatórios do checklist: %.', v_pendentes USING ERRCODE = '23514';
  END IF;

  -- Regra 6: ASO admissional anexado e válido.
  IF NOT EXISTS (
    SELECT 1 FROM public.rh_admissao_itens i
     WHERE i.admissao_id = p_admissao AND i.categoria = 'exame' AND i.status = 'aprovado'
       AND i.arquivo_path IS NOT NULL
       AND (i.data_vencimento IS NULL OR i.data_vencimento >= CURRENT_DATE)
  ) THEN
    RAISE EXCEPTION 'Admissão não conclui sem exame admissional (ASO) aprovado, anexado e dentro da validade.'
      USING ERRCODE = '23514';
  END IF;

  -- Regra 6: contrato / ficha de registro assinada anexada.
  IF NOT EXISTS (
    SELECT 1 FROM public.rh_admissao_itens i
     WHERE i.admissao_id = p_admissao AND i.categoria = 'contrato'
       AND i.status = 'aprovado' AND i.arquivo_path IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Admissão não conclui sem o contrato ou a ficha de registro assinada anexada.'
      USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_cand FROM public.rh_candidatos WHERE id = v_adm.candidato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Candidato da admissão não encontrado.' USING ERRCODE = 'P0002'; END IF;

  IF v_adm.cargo_id IS NOT NULL THEN
    SELECT nome INTO v_cargo FROM public.rh_cargos WHERE id = v_adm.cargo_id;
  END IF;
  v_matricula := public.rh_proxima_matricula();

  -- Regra 7: tudo migra do cadastro do candidato.
  INSERT INTO public.funcionarios (
    nome, cpf, rg, cargo, setor, matricula, data_admissao, ativo, observacoes,
    cargo_id, data_nascimento, endereco, telefone, email, foto_path,
    tipo_contratacao, jornada, projeto_id, gestor_id, situacao,
    candidato_id, admissao_id
  ) VALUES (
    v_cand.nome, v_cand.cpf, v_cand.rg, coalesce(v_cargo, ''), v_adm.setor, v_matricula,
    coalesce(v_adm.data_efetiva_admissao, v_adm.data_prevista_admissao, CURRENT_DATE),
    true, v_adm.observacoes,
    v_adm.cargo_id, v_cand.data_nascimento, v_cand.endereco, v_cand.telefone, v_cand.email, v_cand.foto_path,
    v_adm.tipo_contratacao, v_adm.jornada, v_adm.projeto_id, v_adm.gestor_id,
    CASE WHEN v_adm.periodo_experiencia = 'nao_se_aplica' THEN 'ativo' ELSE 'experiencia' END,
    v_cand.id, v_adm.id
  ) RETURNING * INTO v_func;

  -- Documentos do checklist viram documentos do colaborador, com validade.
  FOR r IN
    SELECT i.* FROM public.rh_admissao_itens i
     WHERE i.admissao_id = p_admissao AND i.tipo_documento_id IS NOT NULL
       AND i.status = 'aprovado'
  LOOP
    INSERT INTO public.rh_funcionario_documentos
      (funcionario_id, tipo_documento_id, data_emissao, data_vencimento, arquivo_path, status, observacao, autor_id)
    VALUES (v_func.id, r.tipo_documento_id, r.data_documento, r.data_vencimento, r.arquivo_path,
            CASE WHEN r.data_vencimento IS NOT NULL AND r.data_vencimento < CURRENT_DATE
                 THEN 'vencido' ELSE 'valido' END,
            'Migrado da admissão ' || v_adm.codigo, auth.uid());
  END LOOP;

  -- Salário sai da proposta e entra no histórico de remuneração, que é
  -- a tabela que só Diretoria e RH leem.
  SELECT salario INTO v_salario FROM public.rh_admissao_proposta WHERE admissao_id = p_admissao;
  IF v_salario IS NOT NULL THEN
    INSERT INTO public.rh_funcionario_remuneracao
      (funcionario_id, salario, vigencia_inicio, motivo, cargo_id, autor_id, autor_nome)
    VALUES (v_func.id, v_salario, v_func.data_admissao, 'admissao', v_adm.cargo_id,
            auth.uid(), public.rh_nome_atual());
  END IF;

  INSERT INTO public.rh_funcionario_historico
    (funcionario_id, tipo, descricao, valor_novo, data_evento, autor_id, autor_nome)
  VALUES (v_func.id, 'admissao',
          'Admissão concluída a partir de ' || v_adm.codigo || '. Matrícula ' || v_matricula || '.',
          coalesce(v_cargo, ''), v_func.data_admissao, auth.uid(), public.rh_nome_atual());

  UPDATE public.rh_candidatos
     SET funcionario_id = v_func.id, status = 'contratado'
   WHERE id = v_cand.id;

  PERFORM set_config('rh.movimentacao', 'on', true);
  UPDATE public.rh_admissoes
     SET status = 'concluida', funcionario_id = v_func.id,
         data_efetiva_admissao = coalesce(data_efetiva_admissao, v_func.data_admissao)
   WHERE id = p_admissao;
  INSERT INTO public.rh_admissao_historico (admissao_id, status_anterior, status_novo, nota, autor_id, autor_nome)
  VALUES (p_admissao, v_adm.status, 'concluida', btrim(p_nota), auth.uid(), public.rh_nome_atual());

  -- E o candidato finalmente pode ir para a etapa final positiva.
  IF v_adm.candidatura_id IS NOT NULL THEN
    SELECT id INTO v_etapa FROM public.rh_funil_etapas
     WHERE ativo AND tipo = 'final_positiva' ORDER BY ordem LIMIT 1;
    IF v_etapa IS NOT NULL THEN
      UPDATE public.rh_candidaturas
         SET etapa_id = v_etapa, status = 'contratado', data_ultima_movimentacao = now(),
             admissao_id = p_admissao
       WHERE id = v_adm.candidatura_id;
      INSERT INTO public.rh_candidatura_historico
        (candidatura_id, etapa_nova_id, status_anterior, status_novo, nota, autor_id, autor_nome)
      VALUES (v_adm.candidatura_id, v_etapa, 'em_andamento', 'contratado',
              'Contratado: admissão ' || v_adm.codigo || ' concluída. ' || btrim(p_nota),
              auth.uid(), public.rh_nome_atual());
    END IF;
  END IF;
  PERFORM set_config('rh.movimentacao', 'off', true);

  PERFORM public.rh_recalcula_aptidao(v_func.id);
  SELECT * INTO v_func FROM public.funcionarios WHERE id = v_func.id;
  RETURN v_func;
END;
$fn$;

-- ------------------------------------------------------------
-- 6.4) Alocação em obra e LGPD
-- ------------------------------------------------------------
-- Regra 8: a alocação passa por aqui justamente para poder ser negada.
CREATE OR REPLACE FUNCTION public.rh_alocar_funcionario(
  p_funcionario uuid, p_projeto uuid, p_nota text
) RETURNS public.funcionarios
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
DECLARE v_old public.funcionarios; v_new public.funcionarios; v_pend text[];
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Alocar colaborador em obra é do RH ou da Diretoria.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'Escreva o motivo da alocação (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_old FROM public.funcionarios WHERE id = p_funcionario FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado.' USING ERRCODE = 'P0002'; END IF;

  v_pend := public.rh_pendencias_alocacao(p_funcionario);
  IF coalesce(array_length(v_pend, 1), 0) > 0 THEN
    RAISE EXCEPTION 'Colaborador não pode ser alocado. Falta: %.', array_to_string(v_pend, '; ')
      USING ERRCODE = '23514';
  END IF;

  UPDATE public.funcionarios SET projeto_id = p_projeto WHERE id = p_funcionario RETURNING * INTO v_new;
  INSERT INTO public.rh_funcionario_historico
    (funcionario_id, tipo, descricao, valor_anterior, valor_novo, autor_id, autor_nome)
  VALUES (p_funcionario, 'mudanca_obra', btrim(p_nota),
          coalesce((SELECT nome FROM public.projetos WHERE id = v_old.projeto_id), ''),
          coalesce((SELECT nome FROM public.projetos WHERE id = p_projeto), ''),
          auth.uid(), public.rh_nome_atual());
  RETURN v_new;
END;
$fn$;

-- Regra 13: expurgo é anonimização, não exclusão — a estatística fica.
CREATE OR REPLACE FUNCTION public.rh_anonimizar_candidato(p_candidato uuid, p_nota text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NOT public.rh_pode_editar() THEN
    RAISE EXCEPTION 'Expurgo de dados de candidato é do RH ou da Diretoria.' USING ERRCODE = '42501';
  END IF;
  IF p_nota IS NULL OR char_length(btrim(p_nota)) < 5 THEN
    RAISE EXCEPTION 'Registre o motivo do expurgo (mínimo 5 caracteres).' USING ERRCODE = '23514';
  END IF;

  UPDATE public.rh_candidatos
     SET nome = 'Candidato anonimizado',
         cpf = '', rg = '', email = '', telefone = '', whatsapp = '',
         endereco = '{}'::jsonb, linkedin = '', curriculo_path = NULL, foto_path = NULL,
         experiencia_resumo = '', observacoes = btrim(p_nota),
         indicado_por = '', auth_user_id = NULL,
         data_nascimento = NULL,
         status = 'descartado', ativo = false, anonimizado_em = now()
   WHERE id = p_candidato AND anonimizado_em IS NULL;

  UPDATE public.rh_candidato_anexos SET ativo = false WHERE candidato_id = p_candidato;
  DELETE FROM public.rh_candidato_pretensao WHERE candidato_id = p_candidato;
  RETURN true;
END;
$fn$;

-- ------------------------------------------------------------
-- 6.5) Quem pode chamar
-- ------------------------------------------------------------
-- As funções são SECURITY DEFINER: quem valida a permissão é o corpo
-- delas, não o GRANT. `anon` fica de fora de todas.
DO $blk$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'rh_mover_vaga(uuid,text,text)',
    'rh_publicar_vaga(uuid,text)',
    'rh_despublicar_vaga(uuid,text)',
    'rh_mover_candidatura(uuid,uuid,text,uuid,text)',
    'rh_inscrever_candidato(uuid,uuid,text)',
    'rh_gerar_checklist_admissao(uuid)',
    'rh_mover_admissao(uuid,text,text)',
    'rh_concluir_admissao(uuid,text)',
    'rh_alocar_funcionario(uuid,uuid,text)',
    'rh_anonimizar_candidato(uuid,text)',
    'rh_pendencias_alocacao(uuid)',
    'rh_recalcula_aptidao(uuid)',
    'rh_recalcula_aptidao_todos()'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO authenticated, service_role', f);
  END LOOP;
END;
$blk$;

COMMIT;
-- ============================================================
-- 7) Storage e sementes dos catálogos
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 7.1) Buckets privados
-- ------------------------------------------------------------
-- Privados de propósito: currículo e documento de colaborador são dado
-- pessoal. O acesso é por signed URL, nunca por URL pública — foi o
-- erro do bucket `epis`, que nasceu público.
INSERT INTO storage.buckets (id, name, public)
SELECT 'curriculos', 'curriculos', false
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'curriculos');
INSERT INTO storage.buckets (id, name, public)
SELECT 'documentos-rh', 'documentos-rh', false
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'documentos-rh');
INSERT INTO storage.buckets (id, name, public)
SELECT 'fotos-rh', 'fotos-rh', false
 WHERE NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'fotos-rh');

-- Convenção de caminho: <bucket>/<id da pessoa>/<arquivo>. É o que
-- permite dizer "o candidato só mexe na pasta dele".
DROP POLICY IF EXISTS "rh storage leitura"   ON storage.objects;
DROP POLICY IF EXISTS "rh storage escrita"   ON storage.objects;
DROP POLICY IF EXISTS "rh storage candidato" ON storage.objects;
DROP POLICY IF EXISTS "rh storage remocao"   ON storage.objects;

CREATE POLICY "rh storage leitura" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id IN ('curriculos', 'documentos-rh', 'fotos-rh')
    AND (
      public.rh_pode_ler()
      OR (public.rh_candidato_atual() IS NOT NULL
          AND (storage.foldername(name))[1] = public.rh_candidato_atual()::text)
    )
  );

CREATE POLICY "rh storage escrita" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('curriculos', 'documentos-rh', 'fotos-rh')
    AND (
      public.rh_pode_admissao()
      OR (public.rh_candidato_atual() IS NOT NULL
          AND (storage.foldername(name))[1] = public.rh_candidato_atual()::text)
    )
  );

CREATE POLICY "rh storage candidato" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('curriculos', 'documentos-rh', 'fotos-rh')
    AND (public.rh_pode_editar()
         OR (public.rh_candidato_atual() IS NOT NULL
             AND (storage.foldername(name))[1] = public.rh_candidato_atual()::text))
  )
  WITH CHECK (
    bucket_id IN ('curriculos', 'documentos-rh', 'fotos-rh')
    AND (public.rh_pode_editar()
         OR (public.rh_candidato_atual() IS NOT NULL
             AND (storage.foldername(name))[1] = public.rh_candidato_atual()::text))
  );

-- Apagar arquivo é só de RH/Diretoria, e existe para o expurgo da LGPD.
CREATE POLICY "rh storage remocao" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('curriculos', 'documentos-rh', 'fotos-rh') AND public.rh_pode_editar());

-- ------------------------------------------------------------
-- 7.2) Etapas do funil
-- ------------------------------------------------------------
INSERT INTO public.rh_funil_etapas (nome, ordem, tipo, sla_dias, cor, opcional, permite_gestor, status_resultante)
SELECT * FROM (VALUES
  ('Inscrito',                     1,  'inicial',        3, '#64748B', false, false, NULL),
  ('Triagem de currículo',         2,  'intermediaria',  3, '#1F3367', false, false, NULL),
  ('Contato inicial',              3,  'intermediaria',  2, '#1F3367', false, false, NULL),
  ('Entrevista RH',                4,  'intermediaria',  5, '#1F3367', false, false, NULL),
  ('Entrevista técnica / gestor',  5,  'intermediaria',  5, '#E8621A', false, true,  NULL),
  ('Teste prático',                6,  'intermediaria',  5, '#E8621A', true,  true,  NULL),
  ('Proposta enviada',             7,  'intermediaria',  3, '#E8621A', false, false, NULL),
  ('Documentação e exames',        8,  'intermediaria',  7, '#E8621A', false, false, NULL),
  ('Contratado',                   9,  'final_positiva', 0, '#15803D', false, false, 'contratado'),
  ('Reprovado',                    10, 'final_negativa', 0, '#B91C1C', false, true,  'reprovado'),
  ('Desistiu',                     11, 'final_negativa', 0, '#B91C1C', false, false, 'desistiu'),
  ('Banco de talentos',            12, 'final_neutra',   0, '#64748B', false, false, 'banco_talentos')
) AS s(nome, ordem, tipo, sla_dias, cor, opcional, permite_gestor, status_resultante)
WHERE NOT EXISTS (SELECT 1 FROM public.rh_funil_etapas e WHERE lower(e.nome) = lower(s.nome));

-- ------------------------------------------------------------
-- 7.3) Motivos de reprovação
-- ------------------------------------------------------------
INSERT INTO public.rh_motivos_reprovacao (nome, ordem)
SELECT * FROM (VALUES
  ('Perfil técnico insuficiente',           1),
  ('Sem certificação / NR exigida',         2),
  ('Pretensão acima da faixa',              3),
  ('Indisponibilidade de horário ou local', 4),
  ('Não compareceu',                        5),
  ('Reprovado no exame admissional',        6),
  ('Histórico incompatível',                7),
  ('Vaga cancelada',                        8),
  ('Outro',                                 9)
) AS s(nome, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.rh_motivos_reprovacao m WHERE lower(m.nome) = lower(s.nome));

-- ------------------------------------------------------------
-- 7.4) Tipos de documento
-- ------------------------------------------------------------
-- O `nome` das NRs é curto de propósito: é ele que rh_cargos.nrs_exigidas
-- referencia, e é por igualdade de texto que a aptidão é conferida.
INSERT INTO public.rh_tipos_documento
  (nome, descricao, categoria, tem_vencimento, validade_padrao_meses, obrigatorio_admissao, bloqueia_alocacao, ordem)
SELECT * FROM (VALUES
  ('RG',                          'Documento de identidade',                       'pessoal',     false,  0, true,  false,  10),
  ('CPF',                         'Cadastro de Pessoa Física',                     'pessoal',     false,  0, true,  false,  20),
  ('CTPS',                        'Carteira de Trabalho (física ou digital)',      'trabalhista', false,  0, true,  false,  30),
  ('PIS/NIS',                     'Número de inscrição do trabalhador',            'trabalhista', false,  0, true,  false,  40),
  ('Título de eleitor',           'Título de eleitor',                             'pessoal',     false,  0, false, false,  50),
  ('Certificado de reservista',   'Obrigatório para homens até 45 anos',           'pessoal',     false,  0, false, false,  60),
  ('Comprovante de residência',   'Emitido nos últimos 90 dias',                   'pessoal',     false,  0, true,  false,  70),
  ('Comprovante de escolaridade', 'Histórico ou certificado',                      'pessoal',     false,  0, false, false,  80),
  ('Certidão de casamento',       'Ou de nascimento, quando solteiro',             'pessoal',     false,  0, false, false,  90),
  ('Foto 3x4',                    'Para crachá e ficha de registro',               'pessoal',     false,  0, false, false, 100),
  ('Dados bancários',             'Banco, agência, conta e PIX para pagamento',    'outro',       false,  0, true,  false, 110),
  ('CNH',                         'Carteira Nacional de Habilitação',              'pessoal',     true,  60, false, false, 120),
  ('ASO admissional',             'Atestado de Saúde Ocupacional de admissão',     'saude',       true,  12, true,  true,  130),
  ('ASO periódico',               'Atestado de Saúde Ocupacional periódico',       'saude',       true,  12, false, false, 140),
  ('NR-06',                       'EPI: ficha de entrega e treinamento de uso',    'treinamento', true,  24, false, false, 150),
  ('NR-10',                       'Segurança em instalações e serviços elétricos', 'treinamento', true,  24, false, true,  160),
  ('NR-11',                       'Transporte e movimentação de materiais',        'treinamento', true,  36, false, true,  170),
  ('NR-12',                       'Segurança no trabalho em máquinas',             'treinamento', true,  24, false, false, 180),
  ('NR-18',                       'Condições e meio ambiente na construção',       'treinamento', true,  12, false, true,  190),
  ('NR-33',                       'Trabalho em espaços confinados',                'treinamento', true,  12, false, true,  200),
  ('NR-35',                       'Trabalho em altura',                            'treinamento', true,  24, false, true,  210),
  ('Integração do cliente',       'Integração de segurança exigida pela obra',     'treinamento', true,  12, false, true,  220),
  ('Contrato de trabalho',        'Contrato assinado pelas duas partes',           'trabalhista', false,  0, true,  false, 230),
  ('Ficha de registro',           'Ficha de registro de empregado',                'trabalhista', false,  0, true,  false, 240),
  ('Termo LGPD',                  'Consentimento de tratamento de dados',          'outro',       false,  0, false, false, 250)
) AS s(nome, descricao, categoria, tem_vencimento, validade_padrao_meses, obrigatorio_admissao, bloqueia_alocacao, ordem)
WHERE NOT EXISTS (SELECT 1 FROM public.rh_tipos_documento t WHERE lower(t.nome) = lower(s.nome));

-- ------------------------------------------------------------
-- 7.5) Modelo de checklist de admissão
-- ------------------------------------------------------------
INSERT INTO public.rh_checklist_modelos (nome, descricao, tipo_contratacao)
SELECT 'Admissão CLT — padrão GRD',
       'Checklist de admissão usado em obra: documentos pessoais, exame, treinamentos, EPI, contrato e cadastros.',
       'clt'
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_checklist_modelos m WHERE lower(m.nome) = lower('Admissão CLT — padrão GRD'));

DO $blk$
DECLARE v_modelo uuid;
BEGIN
  SELECT id INTO v_modelo FROM public.rh_checklist_modelos
   WHERE lower(nome) = lower('Admissão CLT — padrão GRD');
  IF v_modelo IS NULL THEN RETURN; END IF;

  INSERT INTO public.rh_checklist_modelo_itens
    (modelo_id, titulo, categoria, tipo_documento_id, obrigatorio, responsavel_padrao, ordem, instrucoes)
  SELECT v_modelo, s.titulo, s.categoria,
         (SELECT id FROM public.rh_tipos_documento td WHERE lower(td.nome) = lower(s.tipo_doc)),
         s.obrigatorio, s.responsavel, s.ordem, s.instrucoes
    FROM (VALUES
      ('RG',                        'documento',   'RG',                        true,  'candidato',    10, 'Foto ou digitalização legível, frente e verso.'),
      ('CPF',                       'documento',   'CPF',                       true,  'candidato',    20, 'Pode ser o número na CNH ou no RG.'),
      ('CTPS',                      'documento',   'CTPS',                      true,  'candidato',    30, 'Carteira digital serve: exportar o PDF pelo app.'),
      ('PIS/NIS',                   'documento',   'PIS/NIS',                   true,  'candidato',    40, ''),
      ('Título de eleitor',         'documento',   'Título de eleitor',         false, 'candidato',    50, ''),
      ('Certificado de reservista', 'documento',   'Certificado de reservista', false, 'candidato',    60, 'Homens até 45 anos.'),
      ('Comprovante de residência', 'documento',   'Comprovante de residência', true,  'candidato',    70, 'Conta de luz, água ou telefone dos últimos 90 dias.'),
      ('Foto 3x4',                  'documento',   'Foto 3x4',                  false, 'candidato',    80, 'Para o crachá.'),
      ('Dados bancários',           'documento',   'Dados bancários',           true,  'candidato',    90, 'Banco, agência, conta e chave PIX.'),
      ('Exame admissional (ASO)',   'exame',       'ASO admissional',           true,  'rh',          100, 'Agendar na clínica conveniada. Anexar o ASO com a data e a validade.'),
      ('NR-18 / Integração',        'treinamento', 'NR-18',                     true,  'rh',          110, 'Integração de segurança da construção civil.'),
      ('Integração do cliente',     'treinamento', 'Integração do cliente',     false, 'rh',          120, 'Quando a obra for em cliente industrial que exige integração própria.'),
      ('Entrega de EPI',            'epi',         NULL,                        true,  'almoxarifado',130, 'Entregar pelo módulo de EPIs e colher a assinatura do termo.'),
      ('Contrato de trabalho',      'contrato',    'Contrato de trabalho',      true,  'rh',          140, 'Anexar o contrato assinado pelas duas partes.'),
      ('Ficha de registro',         'contrato',    'Ficha de registro',         true,  'rh',          150, 'Ficha de registro de empregado assinada.'),
      ('Termo LGPD',                'contrato',    'Termo LGPD',                false, 'rh',          160, ''),
      ('Cadastro no eSocial',       'sistema',     NULL,                        true,  'rh',          170, 'Enviar o evento de admissão até o dia anterior ao início.'),
      ('Cadastro no ponto',         'sistema',     NULL,                        true,  'rh',          180, 'Cadastrar no controle de ponto e coletar a biometria.'),
      ('Emissão de crachá',         'sistema',     NULL,                        false, 'rh',          190, '')
    ) AS s(titulo, categoria, tipo_doc, obrigatorio, responsavel, ordem, instrucoes)
   WHERE NOT EXISTS (
     SELECT 1 FROM public.rh_checklist_modelo_itens i
      WHERE i.modelo_id = v_modelo AND lower(i.titulo) = lower(s.titulo));
END;
$blk$;

-- ------------------------------------------------------------
-- 7.6) Cargos
-- ------------------------------------------------------------
-- CBO fica em branco: preencher com número errado é pior do que não
-- preencher, e é o RH quem tem a tabela oficial. A tela permite editar.
INSERT INTO public.rh_cargos
  (nome, setor, escolaridade_minima, nrs_exigidas, exige_cnh, categoria_cnh, descricao, checklist_modelo_id)
SELECT s.nome, s.setor, s.escolaridade, s.nrs, s.cnh, s.cat_cnh, s.descricao,
       (SELECT id FROM public.rh_checklist_modelos m WHERE lower(m.nome) = lower('Admissão CLT — padrão GRD'))
  FROM (VALUES
    ('Servente de obras',                'OPERACIONAL',    'Fundamental incompleto', ARRAY['NR-06','NR-18'],                      false, '', 'Apoio geral à obra: limpeza, transporte de materiais e auxílio às equipes.'),
    ('Ajudante geral',                   'OPERACIONAL',    'Fundamental incompleto', ARRAY['NR-06','NR-18'],                      false, '', 'Auxilia oficiais em atividades de montagem, alvenaria e acabamento.'),
    ('Pedreiro',                         'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-18'],                      false, '', 'Alvenaria, concretagem, revestimento e acabamento.'),
    ('Armador',                          'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-18'],                      false, '', 'Corte, dobra e montagem de armaduras de aço.'),
    ('Carpinteiro',                      'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-18'],                      false, '', 'Formas, escoramento e estruturas de madeira.'),
    ('Soldador',                         'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Solda de estruturas metálicas e tubulação industrial.'),
    ('Eletricista industrial',           'OPERACIONAL',    'Médio / técnico',        ARRAY['NR-06','NR-10','NR-18','NR-35'],      false, '', 'Instalação e manutenção elétrica industrial. NR-10 é condição para entrar em obra.'),
    ('Montador industrial',              'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Montagem de estruturas e equipamentos industriais.'),
    ('Operador de empilhadeira',         'OPERACIONAL',    'Fundamental',            ARRAY['NR-06','NR-11','NR-18'],              false, '', 'Operação de empilhadeira e movimentação de cargas.'),
    ('Motorista',                        'OPERACIONAL',    'Fundamental',            ARRAY['NR-06'],                              true,  'D', 'Transporte de equipe e materiais entre obras.'),
    ('Encarregado de obras',             'OPERACIONAL',    'Médio',                  ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Conduz a frente de serviço e responde pela equipe no campo.'),
    ('Mestre de obras',                  'OPERACIONAL',    'Médio',                  ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Coordena as frentes de serviço e o cumprimento do cronograma.'),
    ('Técnico de segurança do trabalho', 'SEGURANÇA',      'Técnico',                ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Responde pela segurança da obra, treinamentos e documentação de SST.'),
    ('Almoxarife',                       'ADMINISTRATIVO', 'Médio',                  ARRAY['NR-06','NR-18'],                      false, '', 'Controla estoque, entrada de materiais e entrega de EPIs.'),
    ('Auxiliar administrativo',          'ADMINISTRATIVO', 'Médio',                  ARRAY[]::text[],                             false, '', 'Rotinas administrativas de escritório e apoio ao DP.'),
    ('Engenheiro civil',                 'ENGENHARIA',     'Superior',               ARRAY['NR-06','NR-18','NR-35'],              false, '', 'Responde tecnicamente pela obra, pelo planejamento e pela equipe.')
  ) AS s(nome, setor, escolaridade, nrs, cnh, cat_cnh, descricao)
 WHERE NOT EXISTS (SELECT 1 FROM public.rh_cargos c WHERE lower(c.nome) = lower(s.nome));

COMMIT;
