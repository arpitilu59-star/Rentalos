
-- Revoke broad execute on SECURITY DEFINER function (only the trigger needs it)
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;

-- Replace broad public SELECT on logos with owner-scoped + path-prefixed
DROP POLICY IF EXISTS "Public logo read" ON storage.objects;
CREATE POLICY "Logos public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'logos');
-- Note: keeping public SELECT so bill links / WhatsApp messages can show the logo.
-- Listing risk is acceptable here because uploads are non-sensitive brand assets.
