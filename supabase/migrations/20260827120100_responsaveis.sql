-- ============================================================
-- Requisito 3 — pré-cadastro de responsáveis técnico e comercial
-- ------------------------------------------------------------
-- As FKs entram em `projetos` (como a spec pede) E em `orcamentos`.
-- Motivo: hoje o orçamento já guarda os dois papéis como texto
-- digitado à mão — `orcamentos.responsavel` é o comercial e
-- `orcamentos.cnpj` é, apesar do nome, o técnico responsável (ver
-- app.comercial.tsx, campo "Técnico responsável"). É ali que o erro
-- de digitação nasce; resolver só no projeto deixaria o problema de
-- pé na tela do Comercial.
--
-- As colunas de texto antigas NÃO são removidas: continuam como
-- fallback dos registros já lançados.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.responsaveis (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  email      text,
  telefone   text,
  tipo       text NOT NULL DEFAULT 'ambos',
  ativo      boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT responsaveis_tipo_check CHECK (tipo IN ('tecnico', 'comercial', 'ambos'))
);

COMMENT ON COLUMN public.responsaveis.tipo IS
  'tecnico | comercial | ambos — em minúsculas. Define em qual combobox o nome aparece.';
COMMENT ON COLUMN public.responsaveis.ativo IS
  'Inativo some dos comboboxes, mas continua aparecendo nos projetos e orçamentos antigos.';

CREATE INDEX IF NOT EXISTS idx_responsaveis_ativo_tipo
  ON public.responsaveis (ativo, tipo, nome);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.responsaveis TO authenticated;
GRANT ALL ON public.responsaveis TO service_role;

ALTER TABLE public.responsaveis ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read responsaveis"  ON public.responsaveis;
DROP POLICY IF EXISTS "authenticated write responsaveis" ON public.responsaveis;

CREATE POLICY "authenticated read responsaveis" ON public.responsaveis
  FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated write responsaveis" ON public.responsaveis
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP TRIGGER IF EXISTS trg_responsaveis_updated ON public.responsaveis;
CREATE TRIGGER trg_responsaveis_updated
  BEFORE UPDATE ON public.responsaveis
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


-- ------------------------------------------------------------
-- Vínculo nos projetos
-- ------------------------------------------------------------
-- ON DELETE SET NULL: apagar um responsável nunca pode apagar projeto.
ALTER TABLE public.projetos
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_id   uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_comercial_id uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_projetos_resp_tecnico
  ON public.projetos (responsavel_tecnico_id);
CREATE INDEX IF NOT EXISTS idx_projetos_resp_comercial
  ON public.projetos (responsavel_comercial_id);


-- ------------------------------------------------------------
-- Vínculo nos orçamentos
-- ------------------------------------------------------------
ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS responsavel_tecnico_id   uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS responsavel_comercial_id uuid REFERENCES public.responsaveis(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orcamentos_resp_tecnico
  ON public.orcamentos (responsavel_tecnico_id);
CREATE INDEX IF NOT EXISTS idx_orcamentos_resp_comercial
  ON public.orcamentos (responsavel_comercial_id);

COMMENT ON COLUMN public.orcamentos.cnpj IS
  'Apesar do nome, guarda o NOME do técnico responsável (texto livre, legado). O vínculo novo é responsavel_tecnico_id.';
