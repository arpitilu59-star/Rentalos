-- Publishing a listing must not depend on identity/document verification.
--
-- The public browse policies required properties.verification_status =
-- 'verified', and publishProperty() used to SET that flag to 'verified' on
-- every publish — i.e. publishing silently marked the property verified.
-- Now: a listing is publicly visible when the landlord has published it
-- (is_public_listing / is_public). verification_status is left alone and
-- only reflects a real admin decision. Existing records are not modified.

DROP POLICY IF EXISTS "MYR public properties browse" ON public.properties;
CREATE POLICY "MYR public properties browse" ON public.properties
  FOR SELECT TO anon, authenticated
  USING (is_public_listing = true);

DROP POLICY IF EXISTS "MYR public rooms browse" ON public.rooms;
CREATE POLICY "MYR public rooms browse" ON public.rooms
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rooms.property_id
        AND p.is_public_listing = true
    )
  );
