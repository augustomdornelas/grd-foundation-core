GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos TO anon, authenticated;
GRANT ALL ON public.equipamentos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimos TO anon, authenticated;
GRANT ALL ON public.emprestimos TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencoes TO anon, authenticated;
GRANT ALL ON public.manutencoes TO service_role;