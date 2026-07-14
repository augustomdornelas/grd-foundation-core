CREATE TABLE public.locais_equipamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'Base',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.locais_equipamentos TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais_equipamentos TO authenticated;
GRANT ALL ON public.locais_equipamentos TO service_role;

ALTER TABLE public.locais_equipamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public read locais_equipamentos"
  ON public.locais_equipamentos FOR SELECT
  USING (true);

CREATE POLICY "authenticated write locais_equipamentos"
  ON public.locais_equipamentos FOR ALL
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);