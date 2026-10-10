-- Fix: admins could not approve/reject MYR verifications.
--
-- ROOT CAUSE: decideMyrVerification updates the row with the SERVICE-ROLE
-- client (after checking the caller is an active admin in server code).
-- Inside the BEFORE UPDATE trigger protect_verification_review_fields(),
-- auth.uid() is NULL for the service role, so is_admin(NULL) is false and
-- the trigger raised "Only an admin can decide a verification." for EVERY
-- decision — including the root owner.
--
-- FIX: the trigger keeps blocking ordinary signed-in users (browser /
-- anon-key clients), but lets through (a) real active admins calling the DB
-- directly and (b) the trusted server-side service-role / DB-owner session.
-- A new BEFORE INSERT trigger closes the sibling hole where a landlord could
-- INSERT a row that is already status='verified'.

CREATE OR REPLACE FUNCTION public.is_trusted_db_session()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT coalesce(auth.role(), '') = 'service_role'
      OR session_user IN ('postgres', 'supabase_admin', 'service_role');
$$;

CREATE OR REPLACE FUNCTION public.protect_verification_review_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_trusted_db_session()
     AND NOT COALESCE(is_admin(auth.uid()), false)
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

CREATE OR REPLACE FUNCTION public.protect_verification_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_trusted_db_session()
     AND NOT COALESCE(is_admin(auth.uid()), false)
  THEN
    -- A user can only ever submit a PENDING request; the verdict fields
    -- are always set by an admin decision, never by the submitter.
    NEW.status := 'pending';
    NEW.reviewed_by := NULL;
    NEW.reviewed_at := NULL;
    NEW.rejection_reason := NULL;
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

DROP TRIGGER IF EXISTS trg_protect_myr_verification_insert ON public.myr_verifications;
CREATE TRIGGER trg_protect_myr_verification_insert
  BEFORE INSERT ON public.myr_verifications
  FOR EACH ROW EXECUTE FUNCTION public.protect_verification_insert();
