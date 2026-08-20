-- ============================================================
-- Custos de mão de obra — função, valor da diária e quantidade
-- ------------------------------------------------------------
-- Quando a categoria do custo é "Mão de obra", o lançamento deixa
-- de ser um valor solto e passa a ser função × diária × quantidade.
--
-- `custos.valor` NÃO muda de significado: continua sendo o total, e
-- é ele que os somatórios, os gráficos e a aba Planejamento ×
-- Execução leem. O total passa a ser calculado
-- (valor_diaria × quantidade_diarias) em vez de digitado, mas cai na
-- mesma coluna de sempre — nada a jusante precisa saber disso.
--
-- IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Cadastro de funções (aberto, mesmo padrão de `unidades`)
-- ------------------------------------------------------------
-- Existe para alimentar o select e receber os cadastros feitos na
-- hora do lançamento. O custo guarda o NOME, não a chave — ver o
-- comentário da coluna `funcao` mais abaixo.
CREATE TABLE IF NOT EXISTS public.funcoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Índice sobre lower(nome): impede "Pedreiro" e "PEDREIRO" no cadastro.
CREATE UNIQUE INDEX IF NOT EXISTS uq_funcoes_nome ON public.funcoes (lower(nome));

GRANT SELECT ON public.funcoes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcoes TO authenticated;
GRANT ALL ON public.funcoes TO service_role;

ALTER TABLE public.funcoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "funcoes leitura" ON public.funcoes;
CREATE POLICY "funcoes leitura" ON public.funcoes
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "funcoes escrita autenticada" ON public.funcoes;
CREATE POLICY "funcoes escrita autenticada" ON public.funcoes
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Funções iniciais. ON CONFLICT precisa nomear a expressão do índice:
-- `DO NOTHING` sem alvo não cobre índice sobre lower(nome).
INSERT INTO public.funcoes (nome) VALUES
  ('Pedreiro'),
  ('Ajudante'),
  ('Servente'),
  ('Encarregado'),
  ('Pintor'),
  ('Armador'),
  ('Carpinteiro'),
  ('Eletricista'),
  ('Meio-oficial')
ON CONFLICT (lower(nome)) DO NOTHING;

-- ------------------------------------------------------------
-- 2) Custos — colunas de mão de obra
-- ------------------------------------------------------------
-- Todas NULLABLE e SEM DEFAULT de propósito. Em custo que não é de
-- mão de obra elas não se aplicam, e NULL diz exatamente isso; 0
-- mentiria ("zero diárias"). Sem default, nenhuma linha existente é
-- tocada — foi o `NOT NULL DEFAULT 0` de `notas_fiscais.quantidade`
-- que obrigou aquele UPDATE de acerto na migração de agosto.
ALTER TABLE public.custos
  ADD COLUMN IF NOT EXISTS funcao             text,
  ADD COLUMN IF NOT EXISTS valor_diaria       numeric,
  ADD COLUMN IF NOT EXISTS quantidade_diarias numeric;

COMMENT ON COLUMN public.custos.funcao IS
  'Nome da função no momento do lançamento (snapshot de public.funcoes.nome). '
  'Texto e não FK, mesma razão de notas_fiscais.unidade: renomear ou remover '
  'a função do cadastro não pode reescrever lançamentos antigos. '
  'Preenchido só em custo de mão de obra.';

COMMENT ON COLUMN public.custos.valor_diaria IS
  'Valor de uma diária em R$. Preenchido só em custo de mão de obra.';

COMMENT ON COLUMN public.custos.quantidade_diarias IS
  'Quantidade de diárias; numeric porque aceita fração (2.5 = duas diárias '
  'e meia — meio período acontece em obra). Só em custo de mão de obra.';
