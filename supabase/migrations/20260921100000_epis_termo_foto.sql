-- ============================================================
-- EPIs — termo de entrega assinado por FOTO
-- ------------------------------------------------------------
-- A assinatura em papel sai. O termo passa a ser "assinado" pela foto
-- do colaborador recebendo os EPIs, tirada na hora pelo Portal. A foto
-- e o PDF do termo (já com a foto impressa) ficam guardados no Storage,
-- e a entrega registra onde estão, quando e por quem foi assinada.
--
-- 1) entregas_epi ganha:
--      foto_recebimento_path  termos-epi/<ano>/<numero_termo>/foto.jpg
--      termo_pdf_path         termos-epi/<ano>/<numero_termo>/termo.pdf
--      assinado_em            momento exato da assinatura (timestamptz;
--                             data_assinatura, que é só date, continua
--                             sendo preenchida para quem já a lê)
--      assinado_por           usuário logado que registrou a foto
--
-- 2) epis_tem_modulo(): quem tem o módulo de EPIs. Espelha o que o menu
--    do Portal faz (src/lib/access-store.ts):
--      - se profiles.permissoes tiver {"modulos":{"epis":{"ver":...}}},
--        vale esse valor (é o ajuste individual feito no Admin);
--      - senão, vale o padrão do perfil: administrador, diretoria e
--        almoxarifado (permissoesDoPerfil em src/lib/current-user.ts).
--    Se a matriz de perfis mudar lá, tem que mudar aqui também.
--
-- 3) Bucket PRIVADO `termos-epi`. Privado porque a foto mostra o rosto
--    do colaborador: ninguém lê por URL pública, só por URL assinada
--    gerada para quem tem o módulo.
--      - ler:    quem tem o módulo de EPIs
--      - enviar: quem tem o módulo, e SÓ enquanto o termo não estiver
--                assinado. Enviar de novo (sobrescrever) é o que permite
--                "TENTAR DE NOVO" quando a foto subiu e o PDF não; depois
--                de assinado, foto e PDF ficam congelados.
--      - apagar: ninguém. Não existe policy de DELETE.
--
-- Idempotente: pode rodar mais de uma vez.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Colunas novas em entregas_epi
-- ------------------------------------------------------------
ALTER TABLE public.entregas_epi
  ADD COLUMN IF NOT EXISTS foto_recebimento_path text,
  ADD COLUMN IF NOT EXISTS termo_pdf_path        text,
  ADD COLUMN IF NOT EXISTS assinado_em           timestamptz,
  ADD COLUMN IF NOT EXISTS assinado_por          uuid;

COMMENT ON COLUMN public.entregas_epi.foto_recebimento_path IS
  'Caminho no bucket termos-epi da foto do colaborador recebendo os EPIs. É a assinatura do termo.';
COMMENT ON COLUMN public.entregas_epi.termo_pdf_path IS
  'Caminho no bucket termos-epi do PDF do termo gerado já com a foto.';
COMMENT ON COLUMN public.entregas_epi.assinado_em IS
  'Momento em que a foto foi salva e o termo passou a ASSINADO.';
COMMENT ON COLUMN public.entregas_epi.assinado_por IS
  'auth.uid() de quem registrou a foto no Portal.';

-- ------------------------------------------------------------
-- 2) Quem tem o módulo de EPIs
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.epis_tem_modulo()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT coalesce(
    (
      SELECT CASE
        WHEN jsonb_typeof(p.permissoes::jsonb #> '{modulos,epis,ver}') = 'boolean'
          THEN (p.permissoes::jsonb #>> '{modulos,epis,ver}')::boolean
        ELSE lower(btrim(coalesce(p.perfil, ''))) IN
          ('administrador', 'admin', 'diretoria', 'almoxarifado')
      END
      FROM public.profiles p
      WHERE p.id = auth.uid()
    ),
    false
  );
$fn$;
COMMENT ON FUNCTION public.epis_tem_modulo() IS
  'Usuário logado enxerga o módulo de EPIs. Mesma regra do menu: ajuste individual em profiles.permissoes.modulos.epis.ver, senão o padrão do perfil.';
REVOKE ALL ON FUNCTION public.epis_tem_modulo() FROM anon;
GRANT EXECUTE ON FUNCTION public.epis_tem_modulo() TO authenticated;

-- O termo do caminho <ano>/<numero_termo>/<arquivo> ainda está aberto?
-- Termo que não existe conta como aberto: o upload vem logo depois de
-- criar a entrega, e a linha já existe — mas não vale travar por isso.
CREATE OR REPLACE FUNCTION public.epis_termo_aberto(p_caminho text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $fn$
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.entregas_epi e
    WHERE e.numero_termo = split_part(p_caminho, '/', 2)
      AND e.assinado
  );
$fn$;
REVOKE ALL ON FUNCTION public.epis_termo_aberto(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.epis_termo_aberto(text) TO authenticated;

-- ------------------------------------------------------------
-- 3) Bucket privado termos-epi
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('termos-epi', 'termos-epi', false, 10485760, ARRAY['image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public             = false,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "termos-epi leitura" ON storage.objects;
CREATE POLICY "termos-epi leitura" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'termos-epi' AND public.epis_tem_modulo());

DROP POLICY IF EXISTS "termos-epi envio" ON storage.objects;
CREATE POLICY "termos-epi envio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  );

-- Sobrescrever (upsert) só enquanto o termo não foi assinado.
DROP POLICY IF EXISTS "termos-epi reenvio" ON storage.objects;
CREATE POLICY "termos-epi reenvio" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  )
  WITH CHECK (
    bucket_id = 'termos-epi'
    AND public.epis_tem_modulo()
    AND public.epis_termo_aberto(name)
  );

-- Sem policy de DELETE: nenhum usuário apaga foto nem termo.
DROP POLICY IF EXISTS "termos-epi exclusao" ON storage.objects;

-- ------------------------------------------------------------
-- Conferência (rodar depois, se quiser):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'entregas_epi' AND column_name LIKE ANY
--    (ARRAY['foto_recebimento_path','termo_pdf_path','assinado_em','assinado_por']);
--   SELECT id, public FROM storage.buckets WHERE id = 'termos-epi';
--   SELECT public.epis_tem_modulo();   -- true para quem tem o módulo
-- ------------------------------------------------------------
