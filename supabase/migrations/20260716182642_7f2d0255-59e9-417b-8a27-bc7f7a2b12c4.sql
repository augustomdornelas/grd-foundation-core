
GRANT SELECT, INSERT, UPDATE, DELETE ON public.equipamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.emprestimos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.manutencoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categorias_equipamentos TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.locais_equipamentos TO authenticated;

GRANT ALL ON public.equipamentos TO service_role;
GRANT ALL ON public.emprestimos TO service_role;
GRANT ALL ON public.manutencoes TO service_role;
GRANT ALL ON public.categorias_equipamentos TO service_role;
GRANT ALL ON public.locais_equipamentos TO service_role;
