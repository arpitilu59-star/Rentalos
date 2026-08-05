CREATE POLICY "verdocs upload own folder" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "verdocs read own folder" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));

CREATE POLICY "verdocs delete own folder" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-docs' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.is_admin(auth.uid())));