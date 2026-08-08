-- ============================================================
-- Módulo de EPIs — Cadastro, Entrega e Termo de Responsabilidade (NR-6)
-- ------------------------------------------------------------
-- Tabelas:
--   funcionarios       — colaboradores que recebem EPIs
--   epis               — catálogo de Equipamentos de Proteção Individual
--   entregas_epi       — cada entrega (é o "termo" a ser assinado)
--   entrega_epi_itens  — os EPIs de cada entrega (com data e validade)
--
-- Padrão do projeto: RLS habilitado, leitura pública e escrita
-- restrita a usuários autenticados. Reaproveita/garante a função
-- public.tg_set_updated_at() para os triggers de updated_at.
-- ============================================================

-- Garante a função de updated_at (idempotente)
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ------------------------------------------------------------
-- 1) Funcionários
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.funcionarios (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  cpf           text NOT NULL DEFAULT '',
  rg            text NOT NULL DEFAULT '',
  cargo         text NOT NULL DEFAULT '',
  setor         text NOT NULL DEFAULT '',
  matricula     text NOT NULL DEFAULT '',
  data_admissao date,
  ativo         boolean NOT NULL DEFAULT true,
  observacoes   text NOT NULL DEFAULT '',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.funcionarios TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.funcionarios TO authenticated;
GRANT ALL ON public.funcionarios TO service_role;
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "funcionarios leitura" ON public.funcionarios;
CREATE POLICY "funcionarios leitura" ON public.funcionarios
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "funcionarios escrita autenticada" ON public.funcionarios;
CREATE POLICY "funcionarios escrita autenticada" ON public.funcionarios
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP TRIGGER IF EXISTS tg_funcionarios_updated_at ON public.funcionarios;
CREATE TRIGGER tg_funcionarios_updated_at
  BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ------------------------------------------------------------
-- 2) EPIs (catálogo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.epis (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome          text NOT NULL,
  ca            text NOT NULL DEFAULT '',   -- Certificado de Aprovação (nº do CA)
  categoria     text NOT NULL DEFAULT '',
  descricao     text NOT NULL DEFAULT '',
  fabricante    text NOT NULL DEFAULT '',
  validade_dias integer NOT NULL DEFAULT 0, -- validade em dias de uso após a entrega (0 = sem validade)
  ca_validade   date,                       -- data de validade do próprio CA
  estoque       integer NOT NULL DEFAULT 0,
  unidade       text NOT NULL DEFAULT 'un',
  foto_url      text,
  ativo         boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.epis TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.epis TO authenticated;
GRANT ALL ON public.epis TO service_role;
ALTER TABLE public.epis ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "epis leitura" ON public.epis;
CREATE POLICY "epis leitura" ON public.epis
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "epis escrita autenticada" ON public.epis;
CREATE POLICY "epis escrita autenticada" ON public.epis
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP TRIGGER IF EXISTS tg_epis_updated_at ON public.epis;
CREATE TRIGGER tg_epis_updated_at
  BEFORE UPDATE ON public.epis
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ------------------------------------------------------------
-- 3) Entregas de EPI (o termo)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entregas_epi (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id      uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  numero_termo        text NOT NULL DEFAULT '',
  data_entrega        date NOT NULL DEFAULT CURRENT_DATE,
  responsavel_entrega text NOT NULL DEFAULT '', -- responsável da GRD que entregou
  responsavel_cargo   text NOT NULL DEFAULT '',
  status              text NOT NULL DEFAULT 'PENDENTE', -- PENDENTE | ASSINADO
  assinado            boolean NOT NULL DEFAULT false,
  data_assinatura     date,
  observacoes         text NOT NULL DEFAULT '',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entregas_epi TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entregas_epi TO authenticated;
GRANT ALL ON public.entregas_epi TO service_role;
ALTER TABLE public.entregas_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entregas_epi leitura" ON public.entregas_epi;
CREATE POLICY "entregas_epi leitura" ON public.entregas_epi
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "entregas_epi escrita autenticada" ON public.entregas_epi;
CREATE POLICY "entregas_epi escrita autenticada" ON public.entregas_epi
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP TRIGGER IF EXISTS tg_entregas_epi_updated_at ON public.entregas_epi;
CREATE TRIGGER tg_entregas_epi_updated_at
  BEFORE UPDATE ON public.entregas_epi
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_entregas_epi_funcionario ON public.entregas_epi(funcionario_id);
CREATE INDEX IF NOT EXISTS idx_entregas_epi_data ON public.entregas_epi(data_entrega);

-- ------------------------------------------------------------
-- 4) Itens da entrega (EPIs entregues)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.entrega_epi_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrega_id    uuid NOT NULL REFERENCES public.entregas_epi(id) ON DELETE CASCADE,
  epi_id        uuid REFERENCES public.epis(id) ON DELETE SET NULL,
  epi_nome      text NOT NULL DEFAULT '',   -- snapshot do nome do EPI
  ca            text NOT NULL DEFAULT '',   -- snapshot do CA
  quantidade    integer NOT NULL DEFAULT 1,
  motivo        text NOT NULL DEFAULT 'PRIMEIRA ENTREGA', -- PRIMEIRA ENTREGA | TROCA | DANIFICADO | PERDA | VENCIMENTO
  data_entrega  date NOT NULL DEFAULT CURRENT_DATE,
  data_validade date,                       -- data_entrega + validade_dias do EPI
  created_at    timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.entrega_epi_itens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.entrega_epi_itens TO authenticated;
GRANT ALL ON public.entrega_epi_itens TO service_role;
ALTER TABLE public.entrega_epi_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "entrega_epi_itens leitura" ON public.entrega_epi_itens;
CREATE POLICY "entrega_epi_itens leitura" ON public.entrega_epi_itens
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "entrega_epi_itens escrita autenticada" ON public.entrega_epi_itens;
CREATE POLICY "entrega_epi_itens escrita autenticada" ON public.entrega_epi_itens
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_entrega ON public.entrega_epi_itens(entrega_id);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_epi ON public.entrega_epi_itens(epi_id);
CREATE INDEX IF NOT EXISTS idx_entrega_itens_validade ON public.entrega_epi_itens(data_validade);
