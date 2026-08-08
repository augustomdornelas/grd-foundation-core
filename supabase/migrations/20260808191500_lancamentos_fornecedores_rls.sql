-- ============================================================
-- Livro-caixa migrado do sistema antigo (MySQL grdalvenaria)
-- ------------------------------------------------------------
-- As tabelas `fornecedores` e `lancamentos` foram criadas fora do
-- fluxo de migrations (durante a migração de dados) e ficaram sem
-- RLS/policy, então o front não conseguia lê-las.
--
-- Este arquivo é IDEMPOTENTE e NÃO-DESTRUTIVO: o CREATE TABLE é
-- IF NOT EXISTS (nas bases que já têm os dados ele não faz nada) e
-- as policies usam DROP POLICY IF EXISTS antes de recriar.
--
-- Segue o mesmo padrão de projetos/custos/notas_fiscais:
-- acesso apenas para o papel `authenticated`.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Fornecedores (191 registros migrados)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fornecedores (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_id      bigint,                -- id no MySQL antigo (rastreabilidade)
  nome        text NOT NULL,
  contato     text,
  telefone    text,
  endereco    text,
  bairro      text,
  cidade      text,
  estado      text,
  cep         text,
  observacoes text,
  ativo       boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fornecedores auth all" ON public.fornecedores;
CREATE POLICY "fornecedores auth all" ON public.fornecedores
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 2) Lançamentos — livro-caixa completo (11.415 registros migrados)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lancamentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_id             bigint,          -- id no MySQL antigo (rastreabilidade)
  projeto_id         uuid REFERENCES public.projetos(id) ON DELETE CASCADE,
  fornecedor_id      uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  funcionario_old_id integer,         -- id do funcionário no sistema antigo
  tipo               text,            -- mt | mo | tx | ma | st | cp
  categoria          text,            -- ex.: "Saída > Material"
  categoria_grupo    text,            -- MT | MO | TX | MA | ST | CP
  fluxo              text,            -- entrada | saida
  unidade            text,
  descricao          text,
  quantidade         numeric NOT NULL DEFAULT 0,
  valor_unitario     numeric NOT NULL DEFAULT 0,
  valor_total        numeric NOT NULL DEFAULT 0,
  data_planejada     date,
  data_executada     date,
  numero_nota        integer,
  numero_medicao     integer,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.lancamentos TO authenticated;
GRANT ALL ON public.lancamentos TO service_role;
ALTER TABLE public.lancamentos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lancamentos auth all" ON public.lancamentos;
CREATE POLICY "lancamentos auth all" ON public.lancamentos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ------------------------------------------------------------
-- 3) Índices de leitura (a tela do projeto filtra por projeto_id)
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_lancamentos_projeto ON public.lancamentos(projeto_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_fornecedor ON public.lancamentos(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_lancamentos_data_exec ON public.lancamentos(data_executada);
CREATE INDEX IF NOT EXISTS idx_fornecedores_nome ON public.fornecedores(nome);
