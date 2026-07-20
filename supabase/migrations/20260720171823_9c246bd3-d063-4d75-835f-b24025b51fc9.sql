
CREATE POLICY "manutencoes_anexos_select" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'manutencoes-anexos');
CREATE POLICY "manutencoes_anexos_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'manutencoes-anexos');
CREATE POLICY "manutencoes_anexos_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'manutencoes-anexos');
CREATE POLICY "manutencoes_anexos_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'manutencoes-anexos');
