
-- 1. Tighten meter-photos: drop public policies, make bucket private, restrict to owner via folder path
DROP POLICY IF EXISTS "meter photos public read" ON storage.objects;
DROP POLICY IF EXISTS "meter photos public insert" ON storage.objects;
DROP POLICY IF EXISTS "meter photos public update" ON storage.objects;
DROP POLICY IF EXISTS "meter photos public delete" ON storage.objects;
DROP POLICY IF EXISTS "Own meter photo upload" ON storage.objects;

UPDATE storage.buckets SET public = false WHERE id = 'meter-photos';

CREATE POLICY "meter own select" ON storage.objects FOR SELECT
  USING (bucket_id = 'meter-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "meter own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'meter-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "meter own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'meter-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "meter own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'meter-photos' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 2. Create bill-pdfs bucket (public read so Twilio can fetch media URL, owner-only write)
INSERT INTO storage.buckets (id, name, public) VALUES ('bill-pdfs', 'bill-pdfs', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "bill pdfs public read" ON storage.objects FOR SELECT
  USING (bucket_id = 'bill-pdfs');
CREATE POLICY "bill pdfs own insert" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'bill-pdfs' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "bill pdfs own update" ON storage.objects FOR UPDATE
  USING (bucket_id = 'bill-pdfs' AND (auth.uid())::text = (storage.foldername(name))[1]);
CREATE POLICY "bill pdfs own delete" ON storage.objects FOR DELETE
  USING (bucket_id = 'bill-pdfs' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 3. Tenant email
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS email text;

-- 4. Receipt sent timestamp
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS receipt_sent_at timestamptz;
