-- Fix: document uploads failed with "Bucket not found".
-- ROOT CAUSE: the 'myr-kyc' bucket was referenced by storage policies but
-- never created by any migration. Create it PRIVATE (identity documents),
-- with a size cap and a mime allow-list enforced by Storage itself.
-- Path convention (unchanged): {user_id}/{file}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'myr-kyc', 'myr-kyc', false, 5242880,
  ARRAY['image/jpeg','image/png','image/webp','application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','application/pdf'];

-- (Re)create the owner/admin policies idempotently.
DROP POLICY IF EXISTS "myr kyc owner read" ON storage.objects;
CREATE POLICY "myr kyc owner read" ON storage.objects FOR SELECT
  USING (bucket_id = 'myr-kyc' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin(auth.uid())));

DROP POLICY IF EXISTS "myr kyc owner write" ON storage.objects;
CREATE POLICY "myr kyc owner write" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'myr-kyc' AND auth.uid()::text = (storage.foldername(name))[1]);

DROP POLICY IF EXISTS "myr kyc owner delete" ON storage.objects;
CREATE POLICY "myr kyc owner delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'myr-kyc' AND (auth.uid()::text = (storage.foldername(name))[1] OR is_admin(auth.uid())));
