ALTER TABLE public.emprestimos ADD COLUMN IF NOT EXISTS responsavel_cpf text;
ALTER TABLE public.emprestimos ADD COLUMN IF NOT EXISTS responsavel_rg text;
ALTER TABLE public.emprestimos ADD COLUMN IF NOT EXISTS responsavel_cargo text;