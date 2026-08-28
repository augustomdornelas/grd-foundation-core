-- ============================================================
-- Conta Azul — onde o par de tokens do OAuth mora
-- ------------------------------------------------------------
-- POR QUE ESTA TABELA EXISTE
--
-- O OAuth da Conta Azul é de autorização única: alguém com acesso ao
-- financeiro autoriza uma vez, e a partir daí o Portal se vira sozinho
-- renovando o token. Isso só funciona se o par de tokens sobreviver a
-- um restart do servidor — guardá-lo em memória significaria pedir
-- autorização de novo a cada deploy.
--
-- A REGRA QUE MOLDA O ESQUEMA: refresh_token ROTACIONA.
--
-- A cada renovação a Conta Azul devolve um refresh_token NOVO e
-- invalida o anterior. Uma tabela que guardasse só o access_token
-- funcionaria por uma hora e morreria na primeira renovação, com um
-- erro que não aponta para a causa. Por isso as duas colunas são NOT
-- NULL e são sempre gravadas juntas, no mesmo UPDATE: não existe
-- estado intermediário válido em que uma esteja nova e a outra velha.
--
-- Validade: access_token 3600s; refresh_token 5 anos, ou até a próxima
-- renovação — o que vier primeiro.
--
-- UMA LINHA SÓ, e a constraint garante isso. A conexão é da empresa,
-- não do usuário que clicou em conectar: se cada pessoa tivesse a sua,
-- o job de madrugada teria que escolher a de quem, e a resposta certa
-- não existe. `conectado_por` guarda o e-mail de quem autorizou porque
-- é informação de auditoria — não é chave.
--
-- SEGURANÇA: RLS ligada e NENHUMA policy, de propósito.
--
-- Isto não é esquecimento: é o mecanismo. Com RLS ligada e zero
-- policy, `authenticated` e `anon` enxergam zero linhas, sempre, mesmo
-- com SELECT concedido. Só a chave de serviço entra, porque ela ignora
-- RLS. O access_token da Conta Azul dá acesso ao financeiro inteiro da
-- empresa; nenhum token de usuário do Portal deveria conseguir lê-lo,
-- e a tela não precisa dele — ela lê o STATUS pelas server functions,
-- que devolvem data e situação, nunca o segredo.
--
-- IDEMPOTENTE. Roda duas vezes sem efeito colateral.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Função de updated_at
-- ------------------------------------------------------------
-- Já existe desde 20260827120000; recriada aqui pelo mesmo motivo
-- defensivo daquela migration — esta tabela não pode depender de outra
-- ter rodado inteira.
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
-- 1) A tabela
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.integracao_contaazul (
  -- Singleton. `id` fixo em 1 com CHECK é o jeito de o banco recusar a
  -- segunda linha, em vez de a aplicação ter que lembrar de conferir.
  id                smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),

  access_token      text        NOT NULL,
  -- Rotaciona a cada renovação. Ver o cabeçalho.
  refresh_token     text        NOT NULL,
  token_type        text        NOT NULL DEFAULT 'bearer',
  -- Guardado como veio para que uma mudança de escopo do lado deles
  -- fique visível aqui, e não vire um 403 sem explicação lá na frente.
  escopo            text        NOT NULL DEFAULT '',

  -- Quando o access_token vence. Calculado de expires_in na hora da
  -- gravação: guardar o instante absoluto evita ter que saber quando a
  -- resposta chegou para interpretar um número de segundos.
  expira_em         timestamptz NOT NULL,

  -- Quando alguém autorizou pela primeira vez (não muda na renovação).
  conectado_em      timestamptz NOT NULL DEFAULT now(),
  -- Quando o par de tokens foi trocado pela última vez. É a data que a
  -- tela mostra: "renovado hoje às 14h" é o que separa uma integração
  -- viva de uma que parou de renovar há três dias.
  renovado_em       timestamptz NOT NULL DEFAULT now(),
  -- E-mail de quem autorizou. Auditoria, não chave.
  conectado_por     text        NOT NULL DEFAULT '',

  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.integracao_contaazul IS
  'Par de tokens OAuth da Conta Azul. Uma linha só, da empresa. Só a chave de serviço lê e escreve — RLS ligada sem policy nenhuma.';
COMMENT ON COLUMN public.integracao_contaazul.refresh_token IS
  'ROTACIONA: a Conta Azul devolve um novo a cada renovação e invalida o anterior. Gravar sempre junto com o access_token, no mesmo UPDATE.';
COMMENT ON COLUMN public.integracao_contaazul.expira_em IS
  'Instante em que o access_token vence (agora + expires_in, tipicamente 3600s). A renovação dispara com 5 min de folga.';
COMMENT ON COLUMN public.integracao_contaazul.renovado_em IS
  'Última troca bem-sucedida de tokens. É o que a tela mostra como sinal de vida da integração.';

DROP TRIGGER IF EXISTS trg_integracao_contaazul_updated_at ON public.integracao_contaazul;
CREATE TRIGGER trg_integracao_contaazul_updated_at
  BEFORE UPDATE ON public.integracao_contaazul
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ------------------------------------------------------------
-- 2) Fechadura
-- ------------------------------------------------------------
-- RLS ligada, nenhuma policy criada. Ver o cabeçalho: a ausência de
-- policy É a regra de acesso, e não uma pendência.
--
-- Os GRANT/REVOKE existem como segunda camada: mesmo que alguém crie
-- uma policy por engano no futuro, `authenticated` e `anon` continuam
-- sem privilégio de tabela para chegar até ela.
ALTER TABLE public.integracao_contaazul ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.integracao_contaazul FROM anon;
REVOKE ALL ON public.integracao_contaazul FROM authenticated;
GRANT ALL ON public.integracao_contaazul TO service_role;

COMMIT;
