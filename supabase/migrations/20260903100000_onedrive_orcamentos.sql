-- ============================================================
-- OneDrive → Comercial: a origem do orçamento importado
-- ------------------------------------------------------------
-- ETAPA 1: o job lê o NOME das pastas do Comercial no OneDrive e cria
-- o orçamento em rascunho. Não abre arquivo nenhum — valor, CNPJ,
-- validade e tipo de serviço não estão no nome e continuam vazios até
-- a etapa 2. Esta migration prepara o banco para isso.
--
-- ------------------------------------------------------------
-- A DECISÃO: COLUNAS EM `orcamentos`, E NÃO UMA TABELA `orcamento_origem`
-- ------------------------------------------------------------
-- As duas formas foram consideradas. A tabela separada é mais limpa de
-- olhar — mantém `orcamentos` sem colunas de integração — e perde no
-- ponto que decide, que é a idempotência.
--
-- A regra "rodar o sync duas vezes não duplica nada" é implementada
-- por uma chave única em `drive_item_id`. Com a coluna AQUI, criar o
-- orçamento e reivindicar a chave são o MESMO INSERT: ou os dois
-- acontecem, ou nenhum. Com a tabela separada seriam dois comandos, e
-- o cliente do Supabase não abre transação — uma falha de rede entre o
-- primeiro e o segundo deixaria um orçamento sem marca de origem, que
-- a execução seguinte importaria de novo. O duplicado que a regra
-- proíbe nasceria justamente do jeito "mais limpo".
--
-- Os outros dois motivos, menores mas reais:
--   - a relação é 1:1 e não versiona nada; uma tabela para isso é uma
--     junção obrigatória em toda leitura, para sempre;
--   - a listagem do Comercial lê `orcamentos` com `select *` e precisa
--     do selo "a conferir" e do link da pasta em cada linha.
--
-- `orcamentos` já carrega colunas de outros módulos pela mesma lógica
-- (planejado_*, ultima_nota_em, custo_total). Estas seguem a fila.
--
-- ------------------------------------------------------------
-- A CHAVE É O ITEM ID, NUNCA O NOME
-- ------------------------------------------------------------
-- `drive_item_id` é o id do item no Microsoft Graph. Ele sobrevive a
-- renome, e renomear pasta é rotina no acervo: "ORC 091_2026 - X" vira
-- "ORC 091_2026 - X - V02" e continua sendo o mesmo orçamento. Chavear
-- pelo nome criaria um orçamento novo a cada revisão.
--
-- IDEMPOTENTE. Roda duas vezes sem efeito colateral.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Função de updated_at
-- ------------------------------------------------------------
-- Já existe desde 20260827120000; recriada aqui pelo mesmo motivo
-- defensivo das outras — esta migration não pode depender de outra ter
-- rodado inteira.
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 1) A origem, em `orcamentos`
-- ------------------------------------------------------------
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS drive_item_id    text,
  ADD COLUMN IF NOT EXISTS drive_url        text,
  ADD COLUMN IF NOT EXISTS cliente_sugerido text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS importado_em     timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_em     timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por    text NOT NULL DEFAULT '';

COMMENT ON COLUMN public.orcamentos.drive_item_id IS
  'Id do item no Microsoft Graph. CHAVE DE IDEMPOTÊNCIA do sync: é ela que impede a segunda execução de duplicar. Nunca use o nome da pasta, que é renomeado a cada revisão. NULL = orçamento nascido dentro do Portal.';
COMMENT ON COLUMN public.orcamentos.drive_url IS
  'webUrl da pasta no OneDrive. É o link "abrir a pasta" da listagem do Comercial.';
COMMENT ON COLUMN public.orcamentos.cliente_sugerido IS
  'PALPITE, não dado. Preenchido só quando o nome da pasta menciona EXATAMENTE UM cliente cadastrado. Vazio = a definir (nenhum ou mais de um). NUNCA é copiado para `cliente` por máquina — ver o cabeçalho de src/lib/onedrive-sync.ts.';
COMMENT ON COLUMN public.orcamentos.importado_em IS
  'Quando o job criou este rascunho. NULL = não veio do OneDrive.';
COMMENT ON COLUMN public.orcamentos.conferido_em IS
  'Quando alguém do Comercial conferiu o rascunho contra a pasta. NULL com importado_em preenchido = o selo "a conferir" aparece na listagem.';

-- A garantia de "não duplica", no banco e não na aplicação.
--
-- Índice único (e não constraint) por dois motivos: `CREATE UNIQUE
-- INDEX IF NOT EXISTS` é idempotente, o que `ADD CONSTRAINT` não é; e o
-- índice serve de árbitro para o `ON CONFLICT (drive_item_id) DO
-- NOTHING` que o job usa, igualzinho a uma constraint.
--
-- NÃO é índice parcial de propósito. `UNIQUE` no Postgres já deixa
-- passar quantos NULL quiser — que é o caso da esmagadora maioria das
-- linhas, nascidas dentro do Portal. Um índice parcial com WHERE não
-- poderia ser inferido pelo ON CONFLICT do PostgREST, que não tem como
-- repetir o predicado.
CREATE UNIQUE INDEX IF NOT EXISTS ux_orcamentos_drive_item_id
  ON public.orcamentos (drive_item_id);

-- A pergunta que a tela faz: "o que veio do OneDrive e ainda não foi
-- conferido?". Parcial porque quase toda linha tem importado_em NULL.
CREATE INDEX IF NOT EXISTS idx_orcamentos_a_conferir
  ON public.orcamentos (importado_em DESC)
  WHERE importado_em IS NOT NULL AND conferido_em IS NULL;

-- ------------------------------------------------------------
-- 2) A chave de idempotência é imutável
-- ------------------------------------------------------------
-- A policy de escrita de `orcamentos` é ampla ("authenticated write",
-- de 2026-07-16): qualquer logado edita a linha inteira. Isso é o certo
-- para obra, valor e responsável — e é errado para `drive_item_id`, que
-- não é dado do orçamento, é a identidade dele lá fora. Um UPDATE que a
-- limpasse por engano faria a execução seguinte do job importar a mesma
-- pasta de novo, que é exatamente o que a regra proíbe.
--
-- Então o vínculo, uma vez estabelecido, não muda: dá para criar (NULL
-- -> id) e não dá para trocar nem apagar. Isto barra ACIDENTE, e é o
-- que se propõe a fazer: quem entra com a chave de serviço pode tudo, e
-- é assim que o job funciona.
CREATE OR REPLACE FUNCTION public.tg_orcamento_drive_item_imutavel()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.drive_item_id IS NOT NULL
     AND NEW.drive_item_id IS DISTINCT FROM OLD.drive_item_id THEN
    RAISE EXCEPTION
      'drive_item_id não pode ser alterado (% -> %): é a chave que impede o sync do OneDrive de duplicar este orçamento.',
      OLD.drive_item_id, coalesce(NEW.drive_item_id, 'NULL');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orcamentos_drive_item_imutavel ON public.orcamentos;
CREATE TRIGGER trg_orcamentos_drive_item_imutavel
  BEFORE UPDATE OF drive_item_id ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_orcamento_drive_item_imutavel();

-- ------------------------------------------------------------
-- 3) Diário do job
-- ------------------------------------------------------------
-- Mesmo desenho de `secullum_sync`: uma linha por execução, aberta como
-- 'rodando' e fechada com o resultado. É o que a tela de Integrações lê
-- para dizer "sincronizado hoje às 05h12" — e é onde o erro fica quando
-- o job falha, para que uma falha vire aviso na tela e nunca página em
-- branco.
CREATE TABLE IF NOT EXISTS public.onedrive_sync_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Qual ano de pastas esta execução varreu. PARÂMETRO, não constante:
  -- a pasta de 2025 tem o mesmo padrão de nome e fica de fora por
  -- escolha, não por acaso.
  ano           integer     NOT NULL,
  iniciado_em   timestamptz NOT NULL DEFAULT now(),
  terminado_em  timestamptz,
  status        text        NOT NULL DEFAULT 'rodando'
                CHECK (status IN ('rodando', 'ok', 'parcial', 'erro')),

  -- Pastas do ano encontradas no delta.
  pastas        integer     NOT NULL DEFAULT 0,
  -- Quantas viraram orçamento AGORA.
  importados    integer     NOT NULL DEFAULT 0,
  -- Quantas já tinham virado antes. Numa segunda execução seguida, este
  -- número é igual a `pastas` e `importados` é zero — é assim que se lê
  -- no diário que a idempotência funcionou.
  ja_existentes integer     NOT NULL DEFAULT 0,
  -- Itens do delta descartados na triagem: arquivo (o ORC.jpg do
  -- drive), pasta de outro ano, subpasta de dentro de um orçamento,
  -- nome fora do padrão.
  ignorados     integer     NOT NULL DEFAULT 0,
  requisicoes   integer     NOT NULL DEFAULT 0,

  -- O @odata.deltaLink do Graph: onde a próxima execução retoma.
  --
  -- SÓ É GRAVADO QUANDO A EXECUÇÃO GRAVOU TUDO O QUE VIU. Delta é
  -- destrutivo: consumido o token, aquelas mudanças não voltam. Guardar
  -- o token de uma execução que falhou no meio perderia as pastas que
  -- ela não chegou a criar — e perderia para sempre, porque do lado do
  -- Graph nada mudou desde então.
  --
  -- É TAMBÉM O MOTIVO DE ESTA TABELA NÃO SER LIDA DIRETO PELA TELA: a
  -- URL carrega um token de continuação, e a tela não tem o que fazer
  -- com ele. Ver a view no item 5.
  delta_link    text,

  detalhe       text        NOT NULL DEFAULT '',
  erro          text,
  -- E-mail de quem apertou "Sincronizar agora", ou "agendador".
  -- Auditoria, não chave.
  disparado_por text        NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.onedrive_sync_log IS
  'Uma linha por execução do sync do OneDrive. Falha aqui não derruba o Comercial: só deixa de importar pasta nova, e a tela de Integrações mostra o erro.';
COMMENT ON COLUMN public.onedrive_sync_log.delta_link IS
  'Token de continuação do Graph. Gravado só quando a execução gravou tudo o que leu — ver o comentário na coluna. Não sai para a tela.';

CREATE INDEX IF NOT EXISTS idx_onedrive_sync_log_recentes
  ON public.onedrive_sync_log (iniciado_em DESC);

-- A busca que o job faz para retomar: a última execução com token.
CREATE INDEX IF NOT EXISTS idx_onedrive_sync_log_delta
  ON public.onedrive_sync_log (iniciado_em DESC)
  WHERE delta_link IS NOT NULL;

-- ------------------------------------------------------------
-- 4) Fechadura do diário
-- ------------------------------------------------------------
-- RLS ligada e NENHUMA policy, como em `integracao_contaazul`. A
-- ausência de policy É a regra: `authenticated` e `anon` enxergam zero
-- linhas, e só a chave de serviço entra, porque ela ignora RLS. Quem
-- escreve aqui é o job, e mais ninguém.
--
-- A tela não perde nada com isso: ela lê a view do item 5.
ALTER TABLE public.onedrive_sync_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.onedrive_sync_log FROM anon;
REVOKE ALL ON public.onedrive_sync_log FROM authenticated;
GRANT ALL ON public.onedrive_sync_log TO service_role;

-- ------------------------------------------------------------
-- 5) O que a tela vê
-- ------------------------------------------------------------
-- Tudo do diário MENOS o delta_link. A view existe por causa dessa
-- subtração: o token de continuação não tem uso na tela e não há motivo
-- para publicá-lo a todo mundo que abre Integrações.
--
-- SEM `security_invoker`, de propósito — e é o contrário do que a
-- vw_secullum_frescor faz. Lá as tabelas de baixo têm policy de leitura
-- e a view respeita a do usuário; aqui a tabela de baixo é fechada, e a
-- view rodando como dona é justamente o mecanismo que deixa passar as
-- colunas seguras sem abrir a tabela inteira.
DROP VIEW IF EXISTS public.vw_onedrive_sync;
CREATE VIEW public.vw_onedrive_sync AS
SELECT
  id,
  ano,
  iniciado_em,
  terminado_em,
  status,
  pastas,
  importados,
  ja_existentes,
  ignorados,
  requisicoes,
  detalhe,
  erro,
  disparado_por
FROM public.onedrive_sync_log
ORDER BY iniciado_em DESC;

COMMENT ON VIEW public.vw_onedrive_sync IS
  'O diário do sync do OneDrive sem o delta_link, para a tela de Integrações. Roda como dona porque a tabela de baixo é fechada — a subtração da coluna é o ponto da view.';

GRANT SELECT ON public.vw_onedrive_sync TO authenticated;

COMMIT;
