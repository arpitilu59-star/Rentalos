
-- Admin security: TOTP secrets + settings
CREATE TABLE public.admin_security (
  user_id uuid PRIMARY KEY,
  totp_secret text,
  totp_enabled boolean NOT NULL DEFAULT false,
  totp_verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.admin_security TO authenticated;
GRANT ALL ON public.admin_security TO service_role;
ALTER TABLE public.admin_security ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own security read" ON public.admin_security FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own security upsert" ON public.admin_security FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own security update" ON public.admin_security FOR UPDATE USING (auth.uid() = user_id);

-- Trusted devices: bypass new-device email OTP for known fingerprints
CREATE TABLE public.admin_trusted_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  device_fingerprint text NOT NULL,
  label text,
  trusted_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_fingerprint)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_trusted_devices TO authenticated;
GRANT ALL ON public.admin_trusted_devices TO service_role;
ALTER TABLE public.admin_trusted_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own devices all" ON public.admin_trusted_devices FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- One-time codes (email OTP for new devices, TOTP recovery, etc.)
CREATE TABLE public.admin_otp_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  code_hash text NOT NULL,
  purpose text NOT NULL,
  device_fingerprint text,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_admin_otp_user ON public.admin_otp_codes (user_id, purpose, expires_at DESC);
GRANT SELECT, INSERT, UPDATE ON public.admin_otp_codes TO authenticated;
GRANT ALL ON public.admin_otp_codes TO service_role;
ALTER TABLE public.admin_otp_codes ENABLE ROW LEVEL SECURITY;
-- Only server-side (service role) accesses; allow self-read for diagnostics
CREATE POLICY "own otp read" ON public.admin_otp_codes FOR SELECT USING (auth.uid() = user_id);

-- Extend login events with geo info
ALTER TABLE public.admin_login_events
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS country text,
  ADD COLUMN IF NOT EXISTS reason text;

CREATE INDEX IF NOT EXISTS idx_login_events_email_time
  ON public.admin_login_events (email, created_at DESC);
