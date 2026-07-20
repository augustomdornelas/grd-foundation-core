
-- projetos
CREATE TABLE public.projetos (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  cliente TEXT,
  cliente_id UUID REFERENCES public.clientes(id) ON DELETE SET NULL,
  local TEXT,
  descricao TEXT,
  responsavel TEXT,
  data_inicio DATE,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'Planejamento',
  progresso NUMERIC NOT NULL DEFAULT 0,
  orcado NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projetos TO authenticated;
GRANT ALL ON public.projetos TO service_role;
ALTER TABLE public.projetos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projetos auth all" ON public.projetos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- custos
CREATE TABLE public.custos (
  id TEXT PRIMARY KEY,
  projeto_id TEXT NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  data DATE,
  descricao TEXT,
  categoria TEXT,
  valor NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custos TO authenticated;
GRANT ALL ON public.custos TO service_role;
ALTER TABLE public.custos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "custos auth all" ON public.custos FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- notas_fiscais
CREATE TABLE public.notas_fiscais (
  id TEXT PRIMARY KEY,
  projeto_id TEXT NOT NULL REFERENCES public.projetos(id) ON DELETE CASCADE,
  numero TEXT,
  fornecedor TEXT,
  descricao TEXT,
  data DATE,
  valor NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Pendente',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notas_fiscais TO authenticated;
GRANT ALL ON public.notas_fiscais TO service_role;
ALTER TABLE public.notas_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notas_fiscais auth all" ON public.notas_fiscais FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- trigger de updated_at
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER trg_projetos_updated BEFORE UPDATE ON public.projetos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_custos_updated BEFORE UPDATE ON public.custos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_notas_fiscais_updated BEFORE UPDATE ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_projetos_cliente_id ON public.projetos(cliente_id);
CREATE INDEX idx_custos_projeto ON public.custos(projeto_id);
CREATE INDEX idx_notas_projeto ON public.notas_fiscais(projeto_id);
