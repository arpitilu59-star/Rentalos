
-- myr-listings: path convention is {landlord_id}/{listing_id}/{file}
CREATE POLICY "myr listings read auth" ON storage.objects FOR SELECT
  USING (bucket_id = 'myr-listings');
CREATE POLICY "myr listings landlord write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'myr-listings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "myr listings landlord update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'myr-listings' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "myr listings landlord delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'myr-listings' AND auth.uid()::text = (storage.foldername(name))[1]);

-- myr-kyc: path convention is {user_id}/{file}
CREATE POLICY "myr kyc owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'myr-kyc' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin(auth.uid())));
CREATE POLICY "myr kyc owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'myr-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "myr kyc owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'myr-kyc' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin(auth.uid())));
