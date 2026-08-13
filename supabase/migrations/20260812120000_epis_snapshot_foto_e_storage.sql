-- ============================================================
-- EPIs — snapshot completo do item entregue + bucket de fotos
-- ------------------------------------------------------------
-- 1) entrega_epi_itens ganha epi_foto_url, fabricante e unidade.
--    Junto com epi_nome e ca (que já existiam), o item passa a
--    guardar TUDO que o termo imprime. Assim, se o EPI do catálogo
--    for editado ou excluído depois, o termo antigo continua
--    mostrando exatamente o que foi entregue naquele dia.
--
-- 2) Índice único em entregas_epi.numero_termo — hoje a numeração
--    é derivada da contagem local e repete quando um termo é
--    excluído. O índice garante no banco que dois termos nunca
--    saiam com o mesmo número.
--
-- 3) Bucket público `epis` para as fotos do catálogo, com as
--    mesmas policies do bucket `portfolio`: leitura pública,
--    escrita restrita a usuários autenticados. Precisa ser
--    público porque o jsPDF busca a imagem por URL para embutir
--    no termo.
--
-- 4) compras_epi + compra_epi_itens — lançamento de compra em
--    lote. Até aqui o estoque só diminuía (na entrega) e nunca
--    subia. Espelha a estrutura da entrega, inclusive nos campos
--    de snapshot. Nome "compra" e não "entrada": entrada_epi_itens
--    e entrega_epi_itens diferem por uma letra só, e um typo
--    acertaria a tabela errada sem erro nenhum.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Snapshot do item entregue
-- ------------------------------------------------------------
ALTER TABLE public.entrega_epi_itens
  ADD COLUMN IF NOT EXISTS epi_foto_url text,
  ADD COLUMN IF NOT EXISTS fabricante   text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS unidade      text NOT NULL DEFAULT 'un';

COMMENT ON COLUMN public.entrega_epi_itens.epi_foto_url IS
  'Snapshot da foto do EPI no momento da entrega (epis.foto_url).';
COMMENT ON COLUMN public.entrega_epi_itens.fabricante IS
  'Snapshot do fabricante do EPI no momento da entrega.';
COMMENT ON COLUMN public.entrega_epi_itens.unidade IS
  'Snapshot da unidade do EPI no momento da entrega (un / par / cx).';

-- ------------------------------------------------------------
-- 2) Numeração de termo sem repetição
-- ------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_entregas_epi_numero_termo
  ON public.entregas_epi(numero_termo)
  WHERE numero_termo <> '';

-- ------------------------------------------------------------
-- 3) Bucket de fotos dos EPIs
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('epis', 'epis', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "epis fotos leitura publica" ON storage.objects;
CREATE POLICY "epis fotos leitura publica" ON storage.objects
  FOR SELECT USING (bucket_id = 'epis');

DROP POLICY IF EXISTS "epis fotos envio autenticado" ON storage.objects;
CREATE POLICY "epis fotos envio autenticado" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'epis' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "epis fotos atualizacao autenticada" ON storage.objects;
CREATE POLICY "epis fotos atualizacao autenticada" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'epis' AND auth.uid() IS NOT NULL)
  WITH CHECK (bucket_id = 'epis' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "epis fotos exclusao autenticada" ON storage.objects;
CREATE POLICY "epis fotos exclusao autenticada" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'epis' AND auth.uid() IS NOT NULL);

-- ------------------------------------------------------------
-- 4) Compras de EPI (entrada de estoque) — cabeçalho
-- ------------------------------------------------------------
-- fornecedor_id é opcional e guardamos também fornecedor_nome:
-- a tabela `fornecedores` está vazia hoje, e o nome em snapshot
-- mantém a compra legível se o fornecedor for excluído depois.
CREATE TABLE IF NOT EXISTS public.compras_epi (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id   uuid REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  fornecedor_nome text NOT NULL DEFAULT '',   -- snapshot do nome
  numero_nota     text NOT NULL DEFAULT '',
  data_compra     date NOT NULL DEFAULT CURRENT_DATE,
  responsavel     text NOT NULL DEFAULT '',
  observacoes     text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compras_epi TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compras_epi TO authenticated;
GRANT ALL ON public.compras_epi TO service_role;
ALTER TABLE public.compras_epi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compras_epi leitura" ON public.compras_epi;
CREATE POLICY "compras_epi leitura" ON public.compras_epi
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "compras_epi escrita autenticada" ON public.compras_epi;
CREATE POLICY "compras_epi escrita autenticada" ON public.compras_epi
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
DROP TRIGGER IF EXISTS tg_compras_epi_updated_at ON public.compras_epi;
CREATE TRIGGER tg_compras_epi_updated_at
  BEFORE UPDATE ON public.compras_epi
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE INDEX IF NOT EXISTS idx_compras_epi_fornecedor ON public.compras_epi(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_compras_epi_data ON public.compras_epi(data_compra);

-- ------------------------------------------------------------
-- 5) Itens da compra (EPIs comprados)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compra_epi_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id      uuid NOT NULL REFERENCES public.compras_epi(id) ON DELETE CASCADE,
  epi_id         uuid REFERENCES public.epis(id) ON DELETE SET NULL,
  epi_nome       text NOT NULL DEFAULT '',    -- snapshot do nome
  ca             text NOT NULL DEFAULT '',    -- snapshot do CA
  unidade        text NOT NULL DEFAULT 'un',  -- snapshot da unidade
  quantidade     integer NOT NULL DEFAULT 1,
  valor_unitario numeric NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.compra_epi_itens TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_epi_itens TO authenticated;
GRANT ALL ON public.compra_epi_itens TO service_role;
ALTER TABLE public.compra_epi_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "compra_epi_itens leitura" ON public.compra_epi_itens;
CREATE POLICY "compra_epi_itens leitura" ON public.compra_epi_itens
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "compra_epi_itens escrita autenticada" ON public.compra_epi_itens;
CREATE POLICY "compra_epi_itens escrita autenticada" ON public.compra_epi_itens
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compra_itens_compra ON public.compra_epi_itens(compra_id);
CREATE INDEX IF NOT EXISTS idx_compra_itens_epi ON public.compra_epi_itens(epi_id);
