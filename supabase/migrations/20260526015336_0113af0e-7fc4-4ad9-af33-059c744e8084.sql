
-- =========================================================
-- 1. PRIVATE bill-pdfs bucket + owner-scoped policies
-- =========================================================
UPDATE storage.buckets SET public = false WHERE id = 'bill-pdfs';

DROP POLICY IF EXISTS "Public read bill pdfs" ON storage.objects;
DROP POLICY IF EXISTS "bill-pdfs public read" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read bill pdfs" ON storage.objects;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'bill-pdfs owner read' AND tablename = 'objects') THEN
    CREATE POLICY "bill-pdfs owner read" ON storage.objects FOR SELECT
      USING (bucket_id = 'bill-pdfs' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;

-- =========================================================
-- 2. OCR rate-limit table (durable across workers)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  kind text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_owner_time ON public.ai_usage_events (owner_id, created_at DESC);
ALTER TABLE public.ai_usage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own usage all" ON public.ai_usage_events FOR ALL
  USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- =========================================================
-- 3. ADMIN SYSTEM
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.admin_role AS ENUM (
    'root_owner','full_admin','support_admin','subscription_admin','property_admin','finance_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  role public.admin_role NOT NULL DEFAULT 'support_admin',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_admin_time ON public.admin_audit_logs (admin_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.admin_login_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid,
  email text,
  ip_address text,
  user_agent text,
  device_fingerprint text,
  location text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_admin_time ON public.admin_login_events (admin_user_id, created_at DESC);

ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_login_events ENABLE ROW LEVEL SECURITY;

-- Helper functions (security definer to avoid recursion)
CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _uid AND active = true);
$$;

CREATE OR REPLACE FUNCTION public.is_root_owner(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _uid AND role = 'root_owner' AND active = true);
$$;

CREATE OR REPLACE FUNCTION public.has_admin_role(_uid uuid, _role public.admin_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = _uid AND role = _role AND active = true);
$$;

-- RLS policies
CREATE POLICY "admins read admin_users" ON public.admin_users FOR SELECT
  USING (public.is_admin(auth.uid()));
CREATE POLICY "root inserts admin_users" ON public.admin_users FOR INSERT
  WITH CHECK (public.is_root_owner(auth.uid()));
CREATE POLICY "root updates admin_users" ON public.admin_users FOR UPDATE
  USING (public.is_root_owner(auth.uid()) AND role <> 'root_owner');
CREATE POLICY "root deletes admin_users" ON public.admin_users FOR DELETE
  USING (public.is_root_owner(auth.uid()) AND role <> 'root_owner');

CREATE POLICY "admins read audit" ON public.admin_audit_logs FOR SELECT
  USING (public.is_admin(auth.uid()));
CREATE POLICY "admins insert audit" ON public.admin_audit_logs FOR INSERT
  WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "admins read login events" ON public.admin_login_events FOR SELECT
  USING (public.is_admin(auth.uid()));
CREATE POLICY "anyone can record own login attempt" ON public.admin_login_events FOR INSERT
  WITH CHECK (true);

-- Hard-lock the root_owner row
CREATE OR REPLACE FUNCTION public.protect_root_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' AND OLD.role = 'root_owner' THEN
    RAISE EXCEPTION 'Root owner cannot be deleted';
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'root_owner' AND (NEW.role <> 'root_owner' OR NEW.active = false) THEN
    RAISE EXCEPTION 'Root owner cannot be modified';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_protect_root_owner ON public.admin_users;
CREATE TRIGGER trg_protect_root_owner
  BEFORE UPDATE OR DELETE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.protect_root_owner();

DROP TRIGGER IF EXISTS trg_admin_users_updated ON public.admin_users;
CREATE TRIGGER trg_admin_users_updated
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-promote first ever signup to root_owner
CREATE OR REPLACE FUNCTION public.bootstrap_root_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'root_owner') THEN
    INSERT INTO public.admin_users (user_id, role, permissions, created_by)
    VALUES (NEW.id, 'root_owner', '{"all": true}'::jsonb, NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS on_auth_user_bootstrap_root ON auth.users;
CREATE TRIGGER on_auth_user_bootstrap_root
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.bootstrap_root_owner();

-- Backfill: promote the earliest existing user to root_owner if none exists
INSERT INTO public.admin_users (user_id, role, permissions, created_by)
SELECT id, 'root_owner', '{"all": true}'::jsonb, id
FROM auth.users
WHERE NOT EXISTS (SELECT 1 FROM public.admin_users WHERE role = 'root_owner')
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id) DO NOTHING;
