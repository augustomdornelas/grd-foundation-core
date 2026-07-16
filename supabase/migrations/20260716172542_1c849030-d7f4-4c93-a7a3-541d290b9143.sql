
-- Migrar valores de status legados para a nova lista
UPDATE public.orcamentos SET status = 'Levantamento' WHERE status IN ('Em análise', 'Em analise');
UPDATE public.orcamentos SET status = 'Não aprovado' WHERE status = 'Recusado';
UPDATE public.orcamentos SET status = 'Aguardando Retorno' WHERE status = 'Aguardando retorno';

-- Remover coluna de estágio da tabela de orçamentos
ALTER TABLE public.orcamentos DROP COLUMN IF EXISTS estagio;
