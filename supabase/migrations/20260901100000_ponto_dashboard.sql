-- ============================================================
-- Dashboard de Ponto — o que faltava no espelho local
-- ------------------------------------------------------------
-- POR QUE ESTA MIGRATION EXISTE
--
-- A regra do dashboard é dura e não se negocia: ele NUNCA chama a API
-- da Secullum no carregamento. A API tem teto de requisições por hora;
-- uma tela que a consultasse a cada F5 gastaria a cota do dia numa
-- manhã e derrubaria o job de madrugada junto.
--
-- A consequência é que tudo que a tela mostra precisa existir aqui
-- dentro antes. O cache de 20260829100000 trouxe cadastro, batidas e
-- totais — e só. Quatro números que a tela precisa mostrar não tinham
-- onde morar:
--
--   "Em folga"              exige a ESCALA do horário (quais dias a
--                           pessoa trabalha), que vem em /Horarios e
--                           era descartada depois de virar texto de log
--   "De férias/Afastados"   exige /FuncionariosAfastamentos, que nunca
--                           foi lido
--   "Solicitações pendentes" exige /InclusaoPonto/Pendencias, idem
--   Faixa etária            exige a data de nascimento, que vinha no
--                           payload de /Funcionarios e era jogada fora
--
-- Sem isto, esses tiles teriam que mostrar zero — e zero é uma
-- afirmação: diz "ninguém está de férias". Mostrar zero por falta de
-- dado é pior que não mostrar o tile.
--
-- IDEMPOTENTE. Roda duas vezes sem efeito colateral.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Nascimento e sexo no espelho do cadastro
-- ------------------------------------------------------------
-- Os dois já vinham no payload de /Funcionarios (`Nascimento`,
-- `Masculino`); o job simplesmente não os gravava. Nascimento alimenta
-- a faixa etária da aba Equipe.
--
-- `sexo` é text e não boolean de propósito: a Secullum manda
-- `Masculino: true|false`, que não tem como representar "não
-- informado" — e cadastro de RH tem campo em branco o tempo todo.
ALTER TABLE public.secullum_funcionarios
  ADD COLUMN IF NOT EXISTS nascimento date,
  ADD COLUMN IF NOT EXISTS sexo       text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.secullum_funcionarios.nascimento IS
  'Data de nascimento vinda de /Funcionarios. Alimenta a faixa etária. NULL = a Secullum não tem.';
COMMENT ON COLUMN public.secullum_funcionarios.sexo IS
  'M, F ou vazio. Texto porque o booleano da Secullum não distingue "feminino" de "não informado".';

-- ------------------------------------------------------------
-- 2) Horários, com a escala
-- ------------------------------------------------------------
-- O catálogo de horários já era lido pelo job, mas só para virar linha
-- de log. Vira tabela porque é ele que responde "quem está de folga
-- hoje": sem a escala, alguém que não bateu ponto num domingo é
-- indistinguível de um faltante.
--
-- `dias` é o campo Dias de /Horarios, guardado como veio, em texto por
-- posição na semana. A Secullum não publica o contrato desse campo; a
-- leitura tolerante fica em quem consome, não numa constraint aqui que
-- rejeitaria a linha inteira por uma letra fora do esperado.
CREATE TABLE IF NOT EXISTS public.secullum_horarios (
  numero          integer PRIMARY KEY,
  descricao       text NOT NULL DEFAULT '',
  -- Um item por dia da semana, domingo primeiro. Vazio = a Secullum
  -- não mandou a escala, e aí "folga" não é calculável.
  dias            text[] NOT NULL DEFAULT '{}',
  desativar       boolean NOT NULL DEFAULT false,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.secullum_horarios IS
  'Catálogo de escalas. Na conta da GRD só 2 e 6 estão ativos — HE 60% e HE 70% no sábado.';
COMMENT ON COLUMN public.secullum_horarios.dias IS
  'Escala semanal como a Secullum devolve, domingo na posição 1. Array vazio = escala desconhecida, e o tile de folga tem que dizer isso em vez de contar zero.';

-- ------------------------------------------------------------
-- 3) Afastamentos
-- ------------------------------------------------------------
-- Férias, atestado, licença e afastamento do INSS chegam todos pelo
-- mesmo endpoint, separados por uma justificativa em texto livre. A
-- separação em três tiles ("De férias", "Afastados", "Ausência
-- justificada") é feita na leitura, não aqui: classificar na gravação
-- congelaria a regra num job que roda de madrugada, e mudar a regra
-- exigiria re-sincronizar tudo.
CREATE TABLE IF NOT EXISTS public.secullum_afastamentos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secullum_id     integer,
  cpf             text NOT NULL,
  -- Como veio: "FÉRIAS", "ATESTADO MÉDICO", "LICENÇA MATERNIDADE"...
  justificativa   text NOT NULL DEFAULT '',
  inicio          date NOT NULL,
  -- NULL = afastamento em aberto, sem previsão de volta. Acontece em
  -- auxílio-doença, e é diferente de "terminou hoje".
  fim             date,
  observacao      text NOT NULL DEFAULT '',
  sincronizado_em timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  -- A mesma pessoa pode ter dois afastamentos, nunca dois que comecem
  -- no mesmo dia com a mesma justificativa. É o que torna o job
  -- reexecutável sem duplicar.
  CONSTRAINT secullum_afastamentos_unico UNIQUE (cpf, inicio, justificativa)
);

CREATE INDEX IF NOT EXISTS idx_secullum_afastamentos_periodo
  ON public.secullum_afastamentos (inicio, fim);
CREATE INDEX IF NOT EXISTS idx_secullum_afastamentos_cpf
  ON public.secullum_afastamentos (cpf);

COMMENT ON TABLE public.secullum_afastamentos IS
  'Férias, atestados e licenças vindos de /FuncionariosAfastamentos. Quem está afastado HOJE sai de inicio <= hoje AND (fim IS NULL OR fim >= hoje).';

-- ------------------------------------------------------------
-- 4) Solicitações pendentes de inclusão de ponto
-- ------------------------------------------------------------
-- É a fila de trabalho do DP: batida esquecida que o colaborador pediu
-- para incluir e ninguém aprovou ainda. Aparece como tile porque
-- pendência parada é folha errada no fim do mês.
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

COMMENT ON TABLE public.secullum_pendencias IS
  'Fila de inclusões de ponto aguardando aprovação, de /InclusaoPonto/Pendencias. A tabela é reescrita a cada sync: o que saiu da fila lá tem que sumir daqui.';

-- ------------------------------------------------------------
-- 5) Ocupação da licença
-- ------------------------------------------------------------
-- Uma linha só, sempre a mesma. O limite e o uso do plano vêm do
-- endpoint de bancos da Secullum, e o dashboard não pode chamá-lo:
-- guardá-los aqui é o que permite ao tile "20 de 30" existir sem que a
-- tela toque na API.
--
-- A PK booleana travada em true é o jeito de o banco garantir a linha
-- única. Sem ela, um job que falhasse no meio poderia deixar duas
-- linhas e o tile escolheria uma ao acaso.
CREATE TABLE IF NOT EXISTS public.secullum_licenca (
  id              boolean PRIMARY KEY DEFAULT true CHECK (id),
  limite          integer,
  em_uso          integer,
  sincronizado_em timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.secullum_licenca IS
  'Ocupação do plano do Ponto Web, cópia local. NULL nos dois campos = a Secullum não informou, e o tile tem que dizer isso em vez de mostrar 0 de 0.';

-- ------------------------------------------------------------
-- 6) Os dois jobs novos no diário
-- ------------------------------------------------------------
ALTER TABLE public.secullum_sync DROP CONSTRAINT IF EXISTS secullum_sync_tipo_check;
ALTER TABLE public.secullum_sync
  ADD CONSTRAINT secullum_sync_tipo_check
  CHECK (tipo IN (
    'funcionarios', 'batidas', 'totais', 'catalogos', 'carga_inicial',
    'afastamentos', 'pendencias'
  ));

-- ------------------------------------------------------------
-- 7) Permissões — o mesmo desenho do cache
-- ------------------------------------------------------------
-- Leitura para quem já lê RH. Escrita: NINGUÉM pela API. Os jobs
-- entram pela chave de serviço, que ignora RLS por ser dona das
-- tabelas. Sem policy de escrita, um token de usuário roubado não
-- forja férias nem apaga pendência.
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'secullum_horarios', 'secullum_afastamentos', 'secullum_pendencias',
    'secullum_licenca'
  ] LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "%s leitura" ON public.%I', t, t);
    EXECUTE format($pol$
      CREATE POLICY "%s leitura" ON public.%I FOR SELECT TO authenticated
      USING (public.rh_pode_ler())
    $pol$, t, t);
  END LOOP;
END;
$blk$;

-- ------------------------------------------------------------
-- 8) A idade do dado, agora com os dois jobs novos
-- ------------------------------------------------------------
-- Mesma view de antes, com 'afastamentos' e 'pendencias' na lista. Ela
-- é o "Dados de 28/08 às 05h12" do topo da tela, e a idade é calculada
-- no banco de propósito: no navegador ela dependeria do relógio da
-- máquina de quem olha, que numa obra está errado com frequência.
DROP VIEW IF EXISTS public.vw_secullum_frescor;
CREATE VIEW public.vw_secullum_frescor WITH (security_invoker = true) AS
SELECT
  t.tipo,
  u.terminado_em            AS ultima_conclusao,
  u.status                  AS ultimo_status,
  u.registros               AS ultimos_registros,
  u.erro                    AS ultimo_erro,
  CASE
    WHEN u.terminado_em IS NULL THEN NULL
    ELSE round(extract(epoch FROM (now() - u.terminado_em)) / 3600.0, 1)
  END                       AS horas_desde,
  -- 36h é o limite pedido: um job diário que perdeu duas janelas.
  CASE
    WHEN u.terminado_em IS NULL THEN true
    WHEN now() - u.terminado_em > interval '36 hours' THEN true
    ELSE false
  END                       AS atrasado
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
