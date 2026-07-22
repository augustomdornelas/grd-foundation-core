CREATE POLICY "Portfolio arquivos leitura publica" ON storage.objects
  FOR SELECT USING (bucket_id = 'portfolio');

CREATE POLICY "Portfolio arquivos autenticado insere" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "Portfolio arquivos autenticado atualiza" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'portfolio') WITH CHECK (bucket_id = 'portfolio');

CREATE POLICY "Portfolio arquivos autenticado exclui" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'portfolio');