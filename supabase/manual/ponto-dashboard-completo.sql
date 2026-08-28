-- ============================================================
-- PONTO — schema completo para o dashboard funcionar
-- Cole inteiro no SQL Editor do Supabase e rode uma vez.
-- ------------------------------------------------------------
-- Reúne o que estava espalhado em 20260829100000 (cache) e
-- 20260901100000 (dashboard), mais as funções de papel do módulo de
-- RH das quais as policies dependem. Nenhuma das três chegou a ser
-- aplicada neste banco.
--
-- NOMES: três da sua lista não existem no código, e eu mantive o que
-- o código lê — senão a tela quebra de novo no mesmo lugar:
--
--   você escreveu            o código lê
--   ponto_afastamentos   ->  secullum_afastamentos
--   ponto_escala         ->  secullum_horarios
--   secullum_equipamentos->  não existe. O equipamento é a coluna
--                            ponto_batidas.equipamento (text); não há
--                            catálogo de equipamento em lugar nenhum.
--
-- E faltavam duas na lista, que o dashboard também lê:
--   secullum_licenca     (o tile "20 de 30")
--   vw_secullum_frescor  (o carimbo "Dados de ... às ...")
--
-- IDEMPOTENTE: pode rodar de novo sem estragar nada.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Pré-requisito: public.profiles
-- ------------------------------------------------------------
-- Todas as funções de papel saem do perfil gravado em profiles. Se a
-- tabela não existir, é melhor parar aqui com uma mensagem clara do
-- que criar funções que devolvem NULL e trancar todo mundo para fora
-- sem explicação.
DO $blk$
BEGIN
  IF to_regclass('public.profiles') IS NULL THEN
    RAISE EXCEPTION
      'public.profiles não existe. As policies do Ponto dependem dela (colunas id e perfil). Crie profiles antes de rodar este script.';
  END IF;
END;
$blk$;

-- ------------------------------------------------------------
-- 1) Funções de papel
-- ------------------------------------------------------------
-- SECURITY DEFINER porque leem profiles, que tem RLS própria: sem
-- isso, a policy de uma tabela dependeria da policy de outra e o
-- resultado seria "ninguém vê nada".
CREATE OR REPLACE FUNCTION public.rh_perfil_atual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT lower(btrim(coalesce(p.perfil, ''))) FROM public.profiles p WHERE p.id = auth.uid();
$fn$;

-- Diretoria e Administrador enxergam tudo.
CREATE OR REPLACE FUNCTION public.rh_e_direcao()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria');
$fn$;

-- Quem ESCREVE: Diretoria + RH/DP.
CREATE OR REPLACE FUNCTION public.rh_pode_editar()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh');
$fn$;

-- Quem LÊ tudo: os de cima + Administrativo (só leitura).
CREATE OR REPLACE FUNCTION public.rh_pode_ler()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('administrador', 'admin', 'diretoria', 'rh', 'administrativo');
$fn$;

-- Engenheiro/coordenador de obra. 'projetos' entra porque é o perfil
-- que a engenharia usa hoje, antes da reclassificação das contas.
CREATE OR REPLACE FUNCTION public.rh_e_gestor()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT public.rh_perfil_atual() IN ('engenharia', 'projetos');
$fn$;

-- ------------------------------------------------------------
-- 2) Vínculo usuário -> obra
-- ------------------------------------------------------------
-- É o que sustenta "o engenheiro lê só as obras dele". Sem linha aqui,
-- o engenheiro não vê NADA — falha fechada, de propósito: um
-- engenheiro sem vínculo cadastrado vendo a empresa inteira seria o
-- erro mais caro dos dois.
--
-- projeto_id é TEXT porque public.projetos.id é text neste banco. Um
-- uuid aqui faria a FK falhar e derrubaria o script inteiro.
CREATE TABLE IF NOT EXISTS public.rh_usuario_projetos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL,
  projeto_id text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rh_usuario_projetos_unico UNIQUE (usuario_id, projeto_id)
);

CREATE OR REPLACE FUNCTION public.rh_projetos_do_usuario()
RETURNS SETOF text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT up.projeto_id FROM public.rh_usuario_projetos up
   WHERE up.usuario_id = auth.uid() AND up.ativo;
$fn$;

-- ------------------------------------------------------------
-- 3) Espelho do cadastro
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secullum_funcionarios (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secullum_id       integer,
  nome              text NOT NULL DEFAULT '',
  -- Só dígitos, sempre. A API manda "181.272.888-37"; comparar máscara
  -- com máscara é o que transforma a mesma pessoa em duas.
  cpf               text NOT NULL,
  numero_folha      text NOT NULL DEFAULT '',
  admissao          date,
  demissao          date,
  departamento      text NOT NULL DEFAULT '',
  funcao            text NOT NULL DEFAULT '',
  horario_numero    integer,
  nascimento        date,
  sexo              text NOT NULL DEFAULT '',
  empresa_documento text NOT NULL DEFAULT '',
  ativo             boolean NOT NULL DEFAULT true,
  -- text, e não uuid, pelo mesmo motivo de rh_usuario_projetos.
  projeto_id        text,
  funcionario_id    uuid,
  sincronizado_em   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secullum_funcionarios_cpf_digitos CHECK (cpf ~ '^[0-9]*$')
);

-- Se a tabela já existia sem as colunas novas, elas entram aqui.
ALTER TABLE public.secullum_funcionarios
  ADD COLUMN IF NOT EXISTS nascimento date,
  ADD COLUMN IF NOT EXISTS sexo       text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS projeto_id text,
  ADD COLUMN IF NOT EXISTS funcionario_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ux_secullum_funcionarios_cpf
  ON public.secullum_funcionarios (cpf) WHERE cpf <> '';
CREATE INDEX IF NOT EXISTS idx_secullum_funcionarios_ativo
  ON public.secullum_funcionarios (ativo, departamento);
CREATE INDEX IF NOT EXISTS idx_secullum_funcionarios_projeto
  ON public.secullum_funcionarios (projeto_id);

-- `ativo` nunca é escrito pelo job: sai da data de demissão, sempre.
CREATE OR REPLACE FUNCTION public.tg_secullum_funcionario_ativo()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  NEW.ativo := NEW.demissao IS NULL;
  NEW.updated_at := now();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_secullum_funcionarios_ativo ON public.secullum_funcionarios;
CREATE TRIGGER trg_secullum_funcionarios_ativo
  BEFORE INSERT OR UPDATE ON public.secullum_funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_secullum_funcionario_ativo();

-- ------------------------------------------------------------
-- 4) Batidas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ponto_batidas (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secullum_funcionario_id integer,
  cpf                     text NOT NULL,
  data                    date NOT NULL,
  horario                 time NOT NULL,
  fonte_tipo              integer,
  fonte_origem            integer,
  equipamento             text NOT NULL DEFAULT '',
  sincronizado_em         timestamptz NOT NULL DEFAULT now(),
  created_at              timestamptz NOT NULL DEFAULT now(),
  -- A chave natural que torna o reprocessamento seguro. Rodar o job
  -- duas vezes no mesmo dia não pode criar batida repetida — e vai
  -- acontecer, porque job que falha no meio é reexecutado.
  CONSTRAINT ponto_batidas_unica UNIQUE (cpf, data, horario)
);

CREATE INDEX IF NOT EXISTS idx_ponto_batidas_data
  ON public.ponto_batidas (data DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_batidas_cpf_data
  ON public.ponto_batidas (cpf, data DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_batidas_origem
  ON public.ponto_batidas (fonte_origem);

COMMENT ON COLUMN public.ponto_batidas.fonte_origem IS
  'Enum da Secullum: 1=relógio, 2=inclusão manual, 5=central web, 6 e 7=app, 8=integração.';

-- ------------------------------------------------------------
-- 5) Totais calculados
-- ------------------------------------------------------------
-- O tempo já entra em MINUTOS: "08:48" guardado como texto seria
-- texto que ninguém soma.
CREATE TABLE IF NOT EXISTS public.ponto_totais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf           text NOT NULL,
  competencia   date NOT NULL,
  coluna        text NOT NULL,
  valor_minutos integer NOT NULL DEFAULT 0,
  calculado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ponto_totais_unico UNIQUE (cpf, competencia, coluna)
);

CREATE INDEX IF NOT EXISTS idx_ponto_totais_competencia
  ON public.ponto_totais (competencia DESC, coluna);
CREATE INDEX IF NOT EXISTS idx_ponto_totais_cpf
  ON public.ponto_totais (cpf, competencia DESC);

COMMENT ON COLUMN public.ponto_totais.competencia IS
  'Primeiro dia do mês. Um mês por consulta é o limite da API deles.';

-- ------------------------------------------------------------
-- 6) Afastamentos  (era "ponto_afastamentos" na sua lista)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secullum_afastamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secullum_id     integer,
  cpf             text NOT NULL,
  -- Como veio do Ponto Web: "FÉRIAS", "ATESTADO MÉDICO"... A separação
  -- em férias / afastado / ausência justificada é feita na LEITURA, e
  -- não aqui: assim mudar a regra é editar uma função, e não
  -- re-sincronizar todo o histórico.
  justificativa   text NOT NULL DEFAULT '',
  inicio          date NOT NULL,
  -- NULL = afastamento em aberto, sem previsão de volta. É diferente
  -- de "terminou hoje".
  fim             date,
  observacao      text NOT NULL DEFAULT '',
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secullum_afastamentos_unico UNIQUE (cpf, inicio, justificativa)
);

CREATE INDEX IF NOT EXISTS idx_secullum_afastamentos_periodo
  ON public.secullum_afastamentos (inicio, fim);
CREATE INDEX IF NOT EXISTS idx_secullum_afastamentos_cpf
  ON public.secullum_afastamentos (cpf);

-- ------------------------------------------------------------
-- 7) Pendências de inclusão de ponto
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secullum_pendencias (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secullum_id     integer,
  cpf             text NOT NULL,
  data_referencia date,
  tipo            text NOT NULL DEFAULT '',
  descricao       text NOT NULL DEFAULT '',
  solicitado_em   timestamptz,
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secullum_pendencias_unica UNIQUE (cpf, data_referencia, tipo, descricao)
);

CREATE INDEX IF NOT EXISTS idx_secullum_pendencias_data
  ON public.secullum_pendencias (data_referencia DESC);

-- ------------------------------------------------------------
-- 8) Horários, com a escala  (era "ponto_escala" na sua lista)
-- ------------------------------------------------------------
-- É a escala que separa "está de folga" de "faltou". Sem ela, quem não
-- bateu ponto num domingo é indistinguível de um faltante — e o
-- dashboard mostra travessão em vez de inventar o número.
CREATE TABLE IF NOT EXISTS public.secullum_horarios (
  numero          integer PRIMARY KEY,
  descricao       text NOT NULL DEFAULT '',
  -- Um item por dia da semana, domingo na posição 1. Array vazio =
  -- escala desconhecida, que NÃO é "não trabalha nunca".
  dias            text[] NOT NULL DEFAULT '{}',
  desativar       boolean NOT NULL DEFAULT false,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 9) Ocupação da licença
-- ------------------------------------------------------------
-- Linha única, travada pela PK booleana: sem isso um job que falhasse
-- no meio poderia deixar duas linhas e o tile escolheria uma ao acaso.
CREATE TABLE IF NOT EXISTS public.secullum_licenca (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  limite          integer,
  em_uso          integer,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- 10) Diário dos jobs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secullum_sync (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL,
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,
  status       text NOT NULL DEFAULT 'rodando'
               CHECK (status IN ('rodando', 'ok', 'parcial', 'erro')),
  registros    integer NOT NULL DEFAULT 0,
  requisicoes  integer NOT NULL DEFAULT 0,
  -- Onde o job parou. Permite ao sync de totais retomar sem recomeçar
  -- e sem estourar o teto de requisições por hora.
  retomar_de   text,
  detalhe      text NOT NULL DEFAULT '',
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.secullum_sync DROP CONSTRAINT IF EXISTS secullum_sync_tipo_check;
ALTER TABLE public.secullum_sync
  ADD CONSTRAINT secullum_sync_tipo_check
  CHECK (tipo IN (
    'funcionarios', 'batidas', 'totais', 'catalogos',
    'afastamentos', 'pendencias', 'carga_inicial'
  ));

CREATE INDEX IF NOT EXISTS idx_secullum_sync_tipo
  ON public.secullum_sync (tipo, iniciado_em DESC);

-- ------------------------------------------------------------
-- 11) Permissões
-- ------------------------------------------------------------
-- LEITURA
--   Diretoria, RH/DP e Administrativo: tudo        (rh_pode_ler)
--   Engenheiro: só as pessoas das obras dele       (rh_e_gestor + vínculo)
-- ESCRITA
--   Diretoria e RH/DP                              (rh_pode_editar)
--
-- Os jobs continuam entrando pela chave de serviço, que ignora RLS por
-- ser dona das tabelas. A escrita autenticada abaixo existe para
-- correção manual pela tela — não é por onde o sync passa.
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'secullum_funcionarios', 'ponto_batidas', 'ponto_totais',
    'secullum_afastamentos', 'secullum_pendencias', 'secullum_horarios',
    'secullum_licenca', 'secullum_sync', 'rh_usuario_projetos'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s leitura" ON public.%I', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "%s escrita" ON public.%I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s escrita" ON public.%I FOR ALL TO authenticated
      USING (public.rh_pode_editar()) WITH CHECK (public.rh_pode_editar())
    $pol$, t, t);
  END LOOP;
END;
$blk$;

-- Leitura: uma policy por tabela, porque o recorte do engenheiro muda
-- de forma conforme a tabela tenha obra própria ou só o CPF.
CREATE POLICY "secullum_funcionarios leitura" ON public.secullum_funcionarios
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND projeto_id IN (SELECT public.rh_projetos_do_usuario()))
  );

-- As três abaixo são chaveadas por CPF e não têm obra própria: o
-- recorte do engenheiro passa pelo espelho do cadastro.
CREATE POLICY "ponto_batidas leitura" ON public.ponto_batidas
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND EXISTS (
      SELECT 1 FROM public.secullum_funcionarios f
       WHERE f.cpf = ponto_batidas.cpf
         AND f.projeto_id IN (SELECT public.rh_projetos_do_usuario())
    ))
  );

CREATE POLICY "ponto_totais leitura" ON public.ponto_totais
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND EXISTS (
      SELECT 1 FROM public.secullum_funcionarios f
       WHERE f.cpf = ponto_totais.cpf
         AND f.projeto_id IN (SELECT public.rh_projetos_do_usuario())
    ))
  );

CREATE POLICY "secullum_afastamentos leitura" ON public.secullum_afastamentos
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND EXISTS (
      SELECT 1 FROM public.secullum_funcionarios f
       WHERE f.cpf = secullum_afastamentos.cpf
         AND f.projeto_id IN (SELECT public.rh_projetos_do_usuario())
    ))
  );

CREATE POLICY "secullum_pendencias leitura" ON public.secullum_pendencias
  FOR SELECT TO authenticated
  USING (
    public.rh_pode_ler()
    OR (public.rh_e_gestor() AND EXISTS (
      SELECT 1 FROM public.secullum_funcionarios f
       WHERE f.cpf = secullum_pendencias.cpf
         AND f.projeto_id IN (SELECT public.rh_projetos_do_usuario())
    ))
  );

-- Catálogo e metadados: não têm dado pessoal nem dimensão de obra.
-- Trancá-los por obra só deixaria o dashboard do engenheiro sem os
-- rótulos e sem o carimbo de idade do dado.
CREATE POLICY "secullum_horarios leitura" ON public.secullum_horarios
  FOR SELECT TO authenticated USING (public.rh_pode_ler() OR public.rh_e_gestor());

CREATE POLICY "secullum_licenca leitura" ON public.secullum_licenca
  FOR SELECT TO authenticated USING (public.rh_pode_ler() OR public.rh_e_gestor());

CREATE POLICY "secullum_sync leitura" ON public.secullum_sync
  FOR SELECT TO authenticated USING (public.rh_pode_ler() OR public.rh_e_gestor());

-- Cada um enxerga o próprio vínculo; quem edita RH enxerga todos.
CREATE POLICY "rh_usuario_projetos leitura" ON public.rh_usuario_projetos
  FOR SELECT TO authenticated
  USING (public.rh_pode_ler() OR usuario_id = auth.uid());

-- ------------------------------------------------------------
-- 12) Idade do dado
-- ------------------------------------------------------------
-- É o "Dados de 28/08 às 05h12" do topo da tela. A idade é calculada
-- NO BANCO de propósito: no navegador dependeria do relógio da máquina
-- de quem olha, que numa obra está errado com frequência.
--
-- security_invoker: a view respeita a RLS de quem consulta, em vez de
-- virar uma porta lateral para secullum_sync.
DROP VIEW IF EXISTS public.vw_secullum_frescor;
CREATE VIEW public.vw_secullum_frescor WITH (security_invoker = true) AS
SELECT
  t.tipo,
  u.terminado_em AS ultima_conclusao,
  u.status       AS ultimo_status,
  u.registros    AS ultimos_registros,
  u.erro         AS ultimo_erro,
  CASE
    WHEN u.terminado_em IS NULL THEN NULL
    ELSE round(extract(epoch FROM (now() - u.terminado_em)) / 3600.0, 1)
  END AS horas_desde,
  -- 36h é o limite pedido: um job diário que perdeu duas janelas.
  CASE
    WHEN u.terminado_em IS NULL THEN true
    WHEN now() - u.terminado_em > interval '36 hours' THEN true
    ELSE false
  END AS atrasado
FROM (VALUES
  ('funcionarios'), ('batidas'), ('totais'), ('catalogos'),
  ('afastamentos'), ('pendencias')
) AS t(tipo)
LEFT JOIN LATERAL (
  SELECT s.terminado_em, s.status, s.registros, s.erro
    FROM public.secullum_sync s
   WHERE s.tipo = t.tipo AND s.status IN ('ok', 'parcial')
   ORDER BY s.terminado_em DESC NULLS LAST
   LIMIT 1
) u ON true;

GRANT SELECT ON public.vw_secullum_frescor TO authenticated;

COMMIT;

-- O PostgREST guarda o schema em cache; sem isto a API continua
-- respondendo "Could not find the table" mesmo com as tabelas criadas.
NOTIFY pgrst, 'reload schema';
