-- 1. Remove public read on bill-pdfs bucket
DROP POLICY IF EXISTS "bill pdfs public read" ON storage.objects;

-- 2. Tighten admin_login_events INSERT: only service_role (server-side) may insert
DROP POLICY IF EXISTS "anyone can record own login attempt" ON public.admin_login_events;
CREATE POLICY "service role inserts login events"
ON public.admin_login_events
FOR INSERT
TO service_role
WITH CHECK (true);

-- 3. admin_otp_codes: add own-row INSERT/UPDATE/DELETE policies
CREATE POLICY "own otp insert"
ON public.admin_otp_codes
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own otp update"
ON public.admin_otp_codes
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "own otp delete"
ON public.admin_otp_codes
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- 4. Revoke EXECUTE on trigger-only SECURITY DEFINER functions from public/anon/authenticated
REVOKE EXECUTE ON FUNCTION public.protect_root_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bootstrap_root_owner() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;