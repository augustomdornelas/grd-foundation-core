
ALTER TABLE public.emprestimos
  ADD COLUMN IF NOT EXISTS resp_retirada_nome text,
  ADD COLUMN IF NOT EXISTS resp_retirada_cpf text,
  ADD COLUMN IF NOT EXISTS resp_retirada_cargo text,
  ADD COLUMN IF NOT EXISTS resp_entrega_nome text,
  ADD COLUMN IF NOT EXISTS resp_entrega_cargo text,
  ADD COLUMN IF NOT EXISTS condicao_devolucao text,
  ADD COLUMN IF NOT EXISTS observacoes_devolucao text,
  ADD COLUMN IF NOT EXISTS numero_termo_devolucao text;
