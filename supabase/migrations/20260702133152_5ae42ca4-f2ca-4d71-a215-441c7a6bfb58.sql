
-- Backfill primary_role for existing users
UPDATE public.profiles p SET primary_role = 'landlord'
WHERE primary_role IS NULL AND EXISTS (SELECT 1 FROM public.properties WHERE owner_id = p.id);

UPDATE public.profiles p SET primary_role = 'tenant'
WHERE primary_role IS NULL AND (
  EXISTS (SELECT 1 FROM public.tenants t WHERE t.tenant_user_id = p.id)
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE lower(t.email) = lower(p.email))
  OR EXISTS (SELECT 1 FROM public.tenants t WHERE t.phone = p.mobile AND p.mobile IS NOT NULL)
);

-- Also sync from myr_user_roles when profile role is missing
UPDATE public.profiles p SET primary_role = r.role::text
FROM public.myr_user_roles r
WHERE r.user_id = p.id AND p.primary_role IS NULL;

-- Prevent role changes once set (only unset -> set, never landlord<->tenant)
CREATE OR REPLACE FUNCTION public.protect_primary_role()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.primary_role IS NOT NULL
     AND NEW.primary_role IS NOT NULL
     AND OLD.primary_role <> NEW.primary_role THEN
    RAISE EXCEPTION 'Role cannot be changed once set (was %, tried %)', OLD.primary_role, NEW.primary_role;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_protect_role ON public.profiles;
CREATE TRIGGER profiles_protect_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_primary_role();

-- Helper: check current user's role
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT primary_role FROM public.profiles WHERE id = auth.uid();
$$;

-- Idempotent set-role at signup time. Fails if a different role is already set.
CREATE OR REPLACE FUNCTION public.claim_primary_role(_role text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _role NOT IN ('landlord','tenant') THEN RAISE EXCEPTION 'Invalid role'; END IF;

  INSERT INTO public.profiles (id, primary_role) VALUES (_uid, _role)
  ON CONFLICT (id) DO NOTHING;

  SELECT primary_role INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NULL THEN
    UPDATE public.profiles SET primary_role = _role WHERE id = _uid;
    _existing := _role;
  ELSIF _existing <> _role THEN
    RAISE EXCEPTION 'ROLE_MISMATCH:%', _existing;
  END IF;

  -- Mirror into myr_user_roles for legacy code paths
  INSERT INTO public.myr_user_roles (user_id, role)
  VALUES (_uid, _role::public.myr_role)
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN _existing;
END $$;

-- Permanent account deletion
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  -- Audit log
  INSERT INTO public.activity_log (owner_id, action, entity_type, entity_id, metadata)
  VALUES (_uid, 'account_delete', 'user', _uid, jsonb_build_object('at', now()));
  -- Cascade will handle profile via auth.users FK; delete auth user
  DELETE FROM auth.users WHERE id = _uid;
END $$;

GRANT EXECUTE ON FUNCTION public.claim_primary_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_role() TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
