ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS orcamento_id uuid REFERENCES public.orcamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_contrato numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS uq_projetos_orcamento_id ON public.projetos(orcamento_id) WHERE orcamento_id IS NOT NULL;