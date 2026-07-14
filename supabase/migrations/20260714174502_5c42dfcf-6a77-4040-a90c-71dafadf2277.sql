CREATE TABLE public.categorias_equipamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_equipamentos TO authenticated;
GRANT SELECT ON public.categorias_equipamentos TO anon;
GRANT ALL ON public.categorias_equipamentos TO service_role;
ALTER TABLE public.categorias_equipamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read categorias_equipamentos" ON public.categorias_equipamentos FOR SELECT USING (true);
CREATE POLICY "authenticated write categorias_equipamentos" ON public.categorias_equipamentos FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);