-- ============================================================
-- EPIs: código interno (o que vai no QR code da etiqueta)
-- ------------------------------------------------------------
-- Formato GRD-ALM-XX-000 (ex.: GRD-ALM-LV-001). O QR das etiquetas do
-- almoxarifado contém só esse código; o Portal lê o QR na entrega e na
-- compra e acha o EPI por ele.
--
-- Único sem diferenciar maiúsculas (índice em upper()) e só entre quem
-- tem código: EPI sem código não conflita com ninguém.
--
-- JÁ APLICADO em produção em 21/09/2026, direto no SQL Editor, com os
-- códigos dos 52 EPIs gravados. Este arquivo existe para o repositório
-- ficar em dia. IDEMPOTENTE: pode rodar mais de uma vez.
-- ============================================================
ALTER TABLE public.epis ADD COLUMN IF NOT EXISTS codigo_interno text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_epis_codigo_interno ON public.epis (upper(codigo_interno)) WHERE codigo_interno IS NOT NULL;
