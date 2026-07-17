CREATE TABLE public.clientes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'PJ',
  cpf_cnpj text,
  email text,
  telefone text,
  endereco text,
  cidade text,
  estado text,
  colaborador_grd boolean NOT NULL DEFAULT false,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.clientes TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.clientes TO authenticated;
GRANT ALL ON public.clientes TO service_role;

ALTER TABLE public.clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read clientes" ON public.clientes FOR SELECT USING (true);
CREATE POLICY "authenticated write clientes" ON public.clientes FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.tg_clientes_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER clientes_updated_at BEFORE UPDATE ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.tg_clientes_updated_at();