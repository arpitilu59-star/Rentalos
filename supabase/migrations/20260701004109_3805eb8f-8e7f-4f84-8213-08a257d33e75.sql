
-- ============================================================
-- Turn 1: MYR ↔ RentDesk unification schema
-- ============================================================

-- 1) properties: add MYR publish fields + verification
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS is_public_listing boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS myr_city text,
  ADD COLUMN IF NOT EXISTS myr_address text,
  ADD COLUMN IF NOT EXISTS myr_description text,
  ADD COLUMN IF NOT EXISTS myr_cover_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS myr_lat numeric,
  ADD COLUMN IF NOT EXISTS myr_lng numeric,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS property_type text DEFAULT 'pg';

-- 2) rooms: MYR publish + photos
ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS myr_photos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS myr_amenities text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS myr_available boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS myr_deposit numeric,
  ADD COLUMN IF NOT EXISTS myr_description text;

-- Public read policy for MYR browsing (only public + verified)
DROP POLICY IF EXISTS "MYR public rooms browse" ON public.rooms;
CREATE POLICY "MYR public rooms browse" ON public.rooms
  FOR SELECT TO anon, authenticated
  USING (
    is_public = true
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = rooms.property_id
        AND p.is_public_listing = true
        AND p.verification_status = 'verified'
    )
  );

DROP POLICY IF EXISTS "MYR public properties browse" ON public.properties;
CREATE POLICY "MYR public properties browse" ON public.properties
  FOR SELECT TO anon, authenticated
  USING (is_public_listing = true AND verification_status = 'verified');

GRANT SELECT ON public.rooms TO anon;
GRANT SELECT ON public.properties TO anon;

-- 3) profiles: add mobile + UPI for landlord payments + role hint
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS mobile text,
  ADD COLUMN IF NOT EXISTS upi_id text,
  ADD COLUMN IF NOT EXISTS upi_qr_path text,
  ADD COLUMN IF NOT EXISTS primary_role text; -- 'landlord' | 'tenant' | 'admin'

CREATE INDEX IF NOT EXISTS profiles_mobile_idx ON public.profiles (mobile);

-- 4) tenants: allow linking to a tenant auth user by mobile
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS tenant_user_id uuid,
  ADD COLUMN IF NOT EXISTS tenant_code text; -- TID-YYYYMM-XXXX

CREATE UNIQUE INDEX IF NOT EXISTS tenants_tenant_code_uidx ON public.tenants (tenant_code) WHERE tenant_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS tenants_tenant_user_id_idx ON public.tenants (tenant_user_id);

-- 5) bookings (MYR → RentDesk request)
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  landlord_id uuid NOT NULL,
  tenant_user_id uuid NOT NULL,
  tenant_name text NOT NULL,
  tenant_mobile text NOT NULL,
  tenant_email text,
  message text,
  status text NOT NULL DEFAULT 'pending', -- pending|accepted|rejected|cancelled|completed
  decided_at timestamptz,
  tenant_id uuid, -- filled after landlord accepts and creates tenants row
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.bookings TO authenticated;
GRANT ALL ON public.bookings TO service_role;
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant sees own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (tenant_user_id = auth.uid());
CREATE POLICY "Landlord sees own bookings" ON public.bookings
  FOR SELECT TO authenticated USING (landlord_id = auth.uid());
CREATE POLICY "Tenant creates booking" ON public.bookings
  FOR INSERT TO authenticated WITH CHECK (tenant_user_id = auth.uid());
CREATE POLICY "Landlord updates own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (landlord_id = auth.uid());
CREATE POLICY "Tenant cancels own bookings" ON public.bookings
  FOR UPDATE TO authenticated USING (tenant_user_id = auth.uid());

CREATE TRIGGER bookings_updated_at BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6) subscriptions (UPI-based landlord plans)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL UNIQUE,
  plan text NOT NULL DEFAULT 'free', -- free|pro
  status text NOT NULL DEFAULT 'active', -- active|pending|expired|cancelled
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  upi_ref text,
  payment_screenshot_path text,
  amount numeric,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Landlord views own subscription" ON public.subscriptions
  FOR SELECT TO authenticated USING (landlord_id = auth.uid());
CREATE POLICY "Landlord upserts own subscription" ON public.subscriptions
  FOR INSERT TO authenticated WITH CHECK (landlord_id = auth.uid());
CREATE POLICY "Landlord updates own subscription request" ON public.subscriptions
  FOR UPDATE TO authenticated USING (landlord_id = auth.uid());
CREATE POLICY "Admin manages subscriptions" ON public.subscriptions
  FOR ALL TO authenticated USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER subscriptions_updated_at BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) payments: add verification fields for UPI screenshot flow
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified', -- unverified|pending|verified|rejected
  ADD COLUMN IF NOT EXISTS screenshot_path text,
  ADD COLUMN IF NOT EXISTS upi_ref text,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS tenant_user_id uuid;

-- 8) bills: permanent history fields
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS bill_month int,
  ADD COLUMN IF NOT EXISTS bill_year int,
  ADD COLUMN IF NOT EXISTS bill_kind text NOT NULL DEFAULT 'monthly'; -- monthly|move_in|move_out|adhoc

-- Backfill month/year from rent_period_start where possible
UPDATE public.bills
   SET bill_month = EXTRACT(MONTH FROM rent_period_start)::int,
       bill_year  = EXTRACT(YEAR  FROM rent_period_start)::int
 WHERE rent_period_start IS NOT NULL AND (bill_month IS NULL OR bill_year IS NULL);

-- 9) Tenant code generator
CREATE OR REPLACE FUNCTION public.generate_tenant_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  ym text := to_char(now(), 'YYYYMM');
  suffix text;
  code text;
BEGIN
  LOOP
    suffix := lpad((floor(random() * 10000))::int::text, 4, '0');
    code := 'TID-' || ym || '-' || suffix;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.tenants WHERE tenant_code = code);
  END LOOP;
  RETURN code;
END $$;

-- 10) Property storage bucket for MYR photos + docs (reuse existing myr-listings, verification-docs)
-- Nothing to create — buckets exist.

-- 11) Free-plan enforcement helper (used from app code)
CREATE OR REPLACE FUNCTION public.landlord_plan(_uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT plan FROM public.subscriptions WHERE landlord_id = _uid AND status = 'active' LIMIT 1),
    'free'
  );
$$;
