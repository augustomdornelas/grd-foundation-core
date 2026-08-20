-- ============================================================
-- Fornecedores — colunas de documento e e-mail
-- ------------------------------------------------------------
-- O pré-cadastro de fornecedor dentro de Projetos pede CNPJ/CPF,
-- IE/RG e e-mail. As outras colunas do formulário (contato,
-- telefone, endereco, bairro, cidade, estado, cep, observacoes,
-- ativo) já existem desde 20260808191500.
--
-- NÃO cria tabela: só completa a que já está lá. É IDEMPOTENTE
-- (ADD COLUMN IF NOT EXISTS), então rodar numa base que já tenha
-- essas colunas não faz nada.
--
-- Todas nullable de propósito: só `nome` é obrigatório, para dar
-- para registrar o fornecedor com o que se tem na mão e completar
-- o cadastro depois.
-- ============================================================

ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS cnpj_cpf text,
  ADD COLUMN IF NOT EXISTS ie_rg    text,
  ADD COLUMN IF NOT EXISTS email    text;

-- A busca do select é por nome; o documento é o segundo critério de
-- conferência ("é este CNPJ mesmo?") e vale um índice parcial.
CREATE INDEX IF NOT EXISTS idx_fornecedores_cnpj_cpf
  ON public.fornecedores (cnpj_cpf)
  WHERE cnpj_cpf IS NOT NULL;
