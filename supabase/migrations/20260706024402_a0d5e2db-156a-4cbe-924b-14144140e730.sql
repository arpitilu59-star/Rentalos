
-- Storage RLS for live-feed-videos bucket
CREATE POLICY "lfv owner upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'live-feed-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "lfv owner read"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'live-feed-videos' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR public.is_admin(auth.uid())
  ));

CREATE POLICY "lfv owner update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'live-feed-videos' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "lfv owner delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'live-feed-videos' AND (storage.foldername(name))[1] = auth.uid()::text);
