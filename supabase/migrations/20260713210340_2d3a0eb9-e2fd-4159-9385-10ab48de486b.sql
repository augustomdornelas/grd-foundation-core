REVOKE SELECT, INSERT, UPDATE, DELETE ON public.equipamentos FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.emprestimos FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.manutencoes FROM anon;

DROP POLICY IF EXISTS "public write equipamentos" ON public.equipamentos;
DROP POLICY IF EXISTS "public write emprestimos" ON public.emprestimos;
DROP POLICY IF EXISTS "public write manutencoes" ON public.manutencoes;

CREATE POLICY "authenticated write equipamentos"
ON public.equipamentos
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated write emprestimos"
ON public.emprestimos
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "authenticated write manutencoes"
ON public.manutencoes
FOR ALL
TO authenticated
USING (auth.uid() IS NOT NULL)
WITH CHECK (auth.uid() IS NOT NULL);