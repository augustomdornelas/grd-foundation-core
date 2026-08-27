-- ============================================================
-- Cache local da Secullum — Etapa 1
-- ------------------------------------------------------------
-- POR QUE ESTAS TABELAS EXISTEM
--
-- Os limites da API da Secullum não permitem um dashboard que consulte
-- ao vivo:
--   /Calcular e /Calcular/SomenteTotais são POR FUNCIONÁRIO, aceitam no
--   máximo um mês por consulta, e há teto de 100 requisições por hora
--   por banco. Com 20 ativos, uma tela que calculasse ao vivo comeria
--   20% da cota a cada F5.
--   /Funcionarios devolve 392 KB e /Horarios 84 KB numa resposta só.
--
-- Então os jobs escrevem aqui e o dashboard lê só daqui. Se a Secullum
-- cair, a tela continua de pé mostrando o último dado — com a data da
-- última sincronização à vista, que é o que separa "dado velho" de
-- "dado errado".
--
-- QUEM ESCREVE: só os jobs, com a chave de serviço, pelo servidor.
-- QUEM LÊ: Diretoria, RH/DP e Administrativo. Engenharia entra quando
-- existir o De/Para entre departamento da Secullum e projeto do
-- Portal — ver o comentário em secullum_funcionarios.projeto_id.
--
-- IDEMPOTENTE.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Espelho do cadastro
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
  empresa_documento text NOT NULL DEFAULT '',
  ativo             boolean NOT NULL DEFAULT true,
  -- Ligação com o Portal, preenchida quando der: é ela que permite ao
  -- engenheiro ver só a obra dele no dashboard. Hoje o que vem da
  -- Secullum é o NOME do departamento (BRACELL, DEXCO - HH), e não
  -- existe De/Para com public.projetos — enquanto não existir, a tela
  -- fica restrita a Diretoria, RH e Administrativo.
  projeto_id        uuid REFERENCES public.projetos(id) ON DELETE SET NULL,
  funcionario_id    uuid REFERENCES public.funcionarios(id) ON DELETE SET NULL,
  sincronizado_em   timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT secullum_funcionarios_cpf_digitos CHECK (cpf ~ '^[0-9]*$')
);

COMMENT ON TABLE public.secullum_funcionarios IS
  'Espelho do cadastro da Secullum. Fonte da verdade é lá; aqui é cópia para o dashboard não consultar ao vivo.';
COMMENT ON COLUMN public.secullum_funcionarios.ativo IS
  'Derivado de demissao IS NULL. Mantido por trigger para não depender de quem escreve.';

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
-- 2) Batidas
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

COMMENT ON COLUMN public.ponto_batidas.fonte_origem IS
  'Enum da Secullum: 1=relógio de ponto, 2=incluído manualmente, 5=central do funcionário web, 6 e 7=app, 8=integração externa.';

CREATE INDEX IF NOT EXISTS idx_ponto_batidas_data ON public.ponto_batidas (data DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_batidas_cpf_data ON public.ponto_batidas (cpf, data DESC);
CREATE INDEX IF NOT EXISTS idx_ponto_batidas_origem ON public.ponto_batidas (fonte_origem);

-- ------------------------------------------------------------
-- 3) Totais calculados
-- ------------------------------------------------------------
-- O /Calcular/SomenteTotais devolve um RELATÓRIO (Colunas, Linhas,
-- Totais), não um objeto por funcionário. Guardar o JSON cru deixaria
-- toda soma do dashboard dependente de esmiuçar o relatório em tempo
-- de tela. Aqui ele vira linha chave-valor, e o tempo já vem em
-- minutos: "08:48" no banco viraria texto que ninguém soma.
CREATE TABLE IF NOT EXISTS public.ponto_totais (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cpf           text NOT NULL,
  competencia   date NOT NULL,
  coluna        text NOT NULL,
  valor_minutos integer NOT NULL DEFAULT 0,
  calculado_em  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ponto_totais_unico UNIQUE (cpf, competencia, coluna)
);

COMMENT ON COLUMN public.ponto_totais.competencia IS
  'Primeiro dia do mês. Um mês por consulta é o limite da API deles.';
COMMENT ON COLUMN public.ponto_totais.valor_minutos IS
  'Convertido na gravação: "08:48" vira 528. Guardar texto de hora impede somar.';

CREATE INDEX IF NOT EXISTS idx_ponto_totais_competencia
  ON public.ponto_totais (competencia DESC, coluna);

-- ------------------------------------------------------------
-- 4) Diário dos jobs
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.secullum_sync (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         text NOT NULL
               CHECK (tipo IN ('funcionarios', 'batidas', 'totais', 'catalogos')),
  iniciado_em  timestamptz NOT NULL DEFAULT now(),
  terminado_em timestamptz,
  status       text NOT NULL DEFAULT 'rodando'
               CHECK (status IN ('rodando', 'ok', 'parcial', 'erro')),
  registros    integer NOT NULL DEFAULT 0,
  requisicoes  integer NOT NULL DEFAULT 0,
  -- Onde o job parou. É o que permite ao sync-totais retomar sem
  -- recomeçar do zero e sem estourar o teto de requisições por hora.
  retomar_de   text,
  detalhe      text NOT NULL DEFAULT '',
  erro         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_secullum_sync_tipo
  ON public.secullum_sync (tipo, iniciado_em DESC);

COMMENT ON TABLE public.secullum_sync IS
  'Um registro por execução de job. Falha aqui não derruba o dashboard: só envelhece o dado, e a tela mostra a idade.';

-- ------------------------------------------------------------
-- 5) Permissões
-- ------------------------------------------------------------
-- Leitura para quem já lê RH. Escrita: NINGUÉM pela API — os jobs
-- entram pela chave de serviço, que ignora RLS por ser dona das
-- tabelas. Sem policy de escrita, um token de usuário roubado não
-- consegue forjar batida de ponto.
DO $blk$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'secullum_funcionarios', 'ponto_batidas', 'ponto_totais', 'secullum_sync'
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
-- 6) Visão de idade do dado
-- ------------------------------------------------------------
-- É o "Dados de 28/08 às 05h12" da tela. Fica em view para a idade
-- ser calculada no banco e não depender do relógio do navegador.
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
FROM (VALUES ('funcionarios'), ('batidas'), ('totais'), ('catalogos')) AS t(tipo)
LEFT JOIN LATERAL (
  SELECT s.terminado_em, s.status, s.registros, s.erro
    FROM public.secullum_sync s
   WHERE s.tipo = t.tipo AND s.status IN ('ok', 'parcial')
   ORDER BY s.terminado_em DESC NULLS LAST
   LIMIT 1
) u ON true;

GRANT SELECT ON public.vw_secullum_frescor TO authenticated;

COMMIT;
