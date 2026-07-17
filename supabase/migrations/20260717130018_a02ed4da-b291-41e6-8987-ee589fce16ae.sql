DROP POLICY IF EXISTS "publico leitura equipamentos" ON public.equipamentos;
CREATE POLICY "publico leitura equipamentos" ON public.equipamentos FOR SELECT USING (true);
GRANT SELECT ON public.equipamentos TO anon;