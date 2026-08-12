-- ============================================================
-- Ajustes nas Notas Fiscais + tabela de Unidades
-- Rodar no SQL Editor do Supabase (projeto grupo-grd)
-- ============================================================
--
-- O QUE MUDOU EM RELAÇÃO AO RASCUNHO
--
-- A FK de `notas_fiscais.funcionario_id` para `public.funcionarios`
-- foi REMOVIDA. Aquela tabela não existe neste banco: a migration de
-- EPIs (20260808163000) foi escrita e nunca aplicada. O bloco `DO $$`
-- abortaria com "relation public.funcionarios does not exist", e o
-- SQL Editor pararia ali — deixando `numero` ainda NOT NULL, que é
-- justamente o que o código novo precisa que mude.
--
-- A coluna `funcionario_id` continua sendo criada, sem FK. Quando as
-- tabelas de EPI existirem, a restrição entra depois (ver o fim do
-- arquivo).
--
-- Este arquivo é idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabela de unidades (cadastro aberto)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.unidades (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  sigla      text NOT NULL DEFAULT '',
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_unidades_nome ON public.unidades (lower(nome));

GRANT SELECT ON public.unidades TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.unidades TO authenticated;
GRANT ALL ON public.unidades TO service_role;

ALTER TABLE public.unidades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unidades leitura" ON public.unidades;
CREATE POLICY "unidades leitura" ON public.unidades
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "unidades escrita autenticada" ON public.unidades;
CREATE POLICY "unidades escrita autenticada" ON public.unidades
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

-- Unidades iniciais (as mais usadas em obra).
-- ON CONFLICT precisa nomear o índice: `ON CONFLICT DO NOTHING` sem
-- alvo não cobre índice sobre expressão, como o lower(nome) acima.
INSERT INTO public.unidades (nome, sigla) VALUES
  ('Unidade', 'un'),
  ('Metro', 'm'),
  ('Metro quadrado', 'm²'),
  ('Metro cúbico', 'm³'),
  ('Metro linear', 'ml'),
  ('Quilograma', 'kg'),
  ('Tonelada', 't'),
  ('Litro', 'L'),
  ('Saco', 'sc'),
  ('Milheiro', 'mlh'),
  ('Peça', 'pç'),
  ('Caixa', 'cx'),
  ('Diária', 'diária'),
  ('Hora', 'h'),
  ('Mês', 'mês'),
  ('Verba', 'vb')
ON CONFLICT (lower(nome)) DO NOTHING;

-- ------------------------------------------------------------
-- 2) Notas fiscais — novas colunas
-- ------------------------------------------------------------
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS unidade        text,
  ADD COLUMN IF NOT EXISTS quantidade     numeric NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS valor_unitario numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS funcionario_id uuid;

-- Sem FK por ora: public.funcionarios não existe. Ver o fim do arquivo.
CREATE INDEX IF NOT EXISTS idx_notas_funcionario ON public.notas_fiscais (funcionario_id);

-- ------------------------------------------------------------
-- 3) Número da nota deixa de ser obrigatório
-- ------------------------------------------------------------
ALTER TABLE public.notas_fiscais ALTER COLUMN numero DROP NOT NULL;
ALTER TABLE public.notas_fiscais ALTER COLUMN numero DROP DEFAULT;

-- ------------------------------------------------------------
-- 4) Notas já existentes — deixa os três números coerentes
-- ------------------------------------------------------------
-- As colunas novas nascem com quantidade = 1 e valor_unitario = 0, o
-- que faz 1 × 0 = 0 e contradiz o `valor` já gravado. Como daqui em
-- diante o valor é sempre quantidade × unitário, vale acertar o
-- passado: quantidade 1 e unitário igual ao valor.
--
-- Toca só as linhas ainda no padrão, então rodar de novo não estraga
-- nada que já tenha sido preenchido.
UPDATE public.notas_fiscais
   SET valor_unitario = valor
 WHERE quantidade = 1
   AND valor_unitario = 0
   AND valor <> 0;

-- ------------------------------------------------------------
-- 5) Status — remoção
-- ------------------------------------------------------------
-- O código já parou de usar `status` nas notas fiscais (o campo saiu
-- do formulário, da tabela e do tipo NotaFiscal). Pode dropar.
--
-- ATENÇÃO: descarta os status já gravados, sem volta. Se quiser
-- guardar antes:
--   CREATE TABLE public.notas_fiscais_status_backup AS
--     SELECT id, status FROM public.notas_fiscais;
--
-- ALTER TABLE public.notas_fiscais DROP COLUMN status;

-- ------------------------------------------------------------
-- 6) Conferência
-- ------------------------------------------------------------
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'notas_fiscais'
ORDER BY ordinal_position;

SELECT nome, sigla FROM public.unidades ORDER BY nome;

-- ============================================================
-- DEPOIS, quando public.funcionarios existir
-- ============================================================
-- ALTER TABLE public.notas_fiscais
--   ADD CONSTRAINT notas_fiscais_funcionario_id_fkey
--   FOREIGN KEY (funcionario_id) REFERENCES public.funcionarios(id)
--   ON DELETE SET NULL;
