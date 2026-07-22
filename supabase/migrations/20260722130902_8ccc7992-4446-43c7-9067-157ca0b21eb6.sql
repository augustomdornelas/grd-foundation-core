CREATE TABLE public.portfolio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  categoria text,
  foto_url text,
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.portfolio TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio TO authenticated;
GRANT ALL ON public.portfolio TO service_role;

ALTER TABLE public.portfolio ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Portfolio publico leitura" ON public.portfolio
  FOR SELECT TO anon USING (ativo = true);

CREATE POLICY "Autenticados leem tudo" ON public.portfolio
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Autenticados inserem" ON public.portfolio
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Autenticados atualizam" ON public.portfolio
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "Autenticados excluem" ON public.portfolio
  FOR DELETE TO authenticated USING (true);

CREATE TRIGGER tg_portfolio_updated_at
  BEFORE UPDATE ON public.portfolio
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();