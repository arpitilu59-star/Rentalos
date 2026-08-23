-- Landlord identity verification: close the RLS-level self-approval hole.
--
-- Both `verifications` and `myr_verifications` currently have an UPDATE
-- policy that lets the row's own owner_id/user_id update it, with no
-- column-level restriction — meaning a landlord (or any user) could call
-- the Supabase client directly from the browser and set their own
-- status/reviewed_by/reviewed_at, completely bypassing the app's admin
-- check. This is exactly the "landlord manipulates the request from the
-- browser" scenario that must be impossible.
--
-- Fix: a BEFORE UPDATE trigger on each table that rejects any change to
-- the review-decision fields unless the actor is an admin. Regular
-- landlords/tenants can still update their own document paths / notes
-- (e.g. re-uploading a file) — only the verdict itself is protected.
-- This is defense-in-depth alongside the server-side admin checks in
-- decideMyrVerification / reviewVerification — RLS enforces it even if
-- someone bypasses the app entirely.

CREATE OR REPLACE FUNCTION public.protect_verification_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT is_admin(auth.uid())
     AND (
       NEW.status IS DISTINCT FROM OLD.status
       OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by
       OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason
     )
  THEN
    RAISE EXCEPTION 'Only an admin can decide a verification.';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_protect_myr_verification_review ON public.myr_verifications;
CREATE TRIGGER trg_protect_myr_verification_review
  BEFORE UPDATE ON public.myr_verifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_verification_review_fields();

DROP TRIGGER IF EXISTS trg_protect_verification_review ON public.verifications;
CREATE TRIGGER trg_protect_verification_review
  BEFORE UPDATE ON public.verifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_verification_review_fields();
