
-- Tabelas Comercial: orcamentos e medicoes
CREATE TABLE IF NOT EXISTS public.orcamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  numero text NOT NULL DEFAULT '',
  cliente text NOT NULL DEFAULT '',
  cnpj text NOT NULL DEFAULT '',
  tipo_servico text NOT NULL DEFAULT '',
  obra text NOT NULL DEFAULT '',
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  responsavel text NOT NULL DEFAULT '',
  data_emissao date,
  prazo_validade date,
  status text NOT NULL DEFAULT 'Em análise',
  estagio text NOT NULL DEFAULT 'Levantamento',
  probabilidade numeric NOT NULL DEFAULT 0,
  observacoes text NOT NULL DEFAULT '',
  anexo text,
  timeline jsonb NOT NULL DEFAULT '[]'::jsonb,
  notas jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orcamentos TO authenticated;
GRANT SELECT ON public.orcamentos TO anon;
GRANT ALL ON public.orcamentos TO service_role;
ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read orcamentos" ON public.orcamentos FOR SELECT USING (true);
CREATE POLICY "authenticated write orcamentos" ON public.orcamentos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE TABLE IF NOT EXISTS public.medicoes (
  id text NOT NULL PRIMARY KEY,
  orcamento_id uuid NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  numero text NOT NULL DEFAULT '',
  data date NOT NULL DEFAULT CURRENT_DATE,
  descricao text NOT NULL DEFAULT '',
  valor numeric NOT NULL DEFAULT 0,
  percentual_fisico numeric NOT NULL DEFAULT 0,
  data_recebimento date,
  status text NOT NULL DEFAULT 'Lançada',
  observacoes text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.medicoes TO authenticated;
GRANT SELECT ON public.medicoes TO anon;
GRANT ALL ON public.medicoes TO service_role;
ALTER TABLE public.medicoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read medicoes" ON public.medicoes FOR SELECT USING (true);
CREATE POLICY "authenticated write medicoes" ON public.medicoes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_medicoes_orcamento_id ON public.medicoes(orcamento_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_status ON public.orcamentos(status);
