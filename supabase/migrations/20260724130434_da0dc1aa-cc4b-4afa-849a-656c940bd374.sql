CREATE TABLE public.contatos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL,
  telefone TEXT,
  mensagem TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'NOVO',
  observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contatos TO authenticated;
GRANT INSERT ON public.contatos TO anon;
GRANT ALL ON public.contatos TO service_role;

ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public insert contatos" ON public.contatos
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "authenticated read contatos" ON public.contatos
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated update contatos" ON public.contatos
  FOR UPDATE TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated delete contatos" ON public.contatos
  FOR DELETE TO authenticated
  USING (auth.uid() IS NOT NULL);

CREATE TRIGGER trg_contatos_updated_at
  BEFORE UPDATE ON public.contatos
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX idx_contatos_created_at ON public.contatos (created_at DESC);
CREATE INDEX idx_contatos_status ON public.contatos (status);