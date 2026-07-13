
CREATE POLICY "public read equipamentos bucket"
ON storage.objects FOR SELECT
USING (bucket_id = 'equipamentos');

CREATE POLICY "public write equipamentos bucket"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'equipamentos');

CREATE POLICY "public update equipamentos bucket"
ON storage.objects FOR UPDATE
USING (bucket_id = 'equipamentos');

CREATE POLICY "public delete equipamentos bucket"
ON storage.objects FOR DELETE
USING (bucket_id = 'equipamentos');
