-- =========================================
-- Phase 4 & 5: Verification, Maintenance, Move, Deposits, Fraud, Activity
-- =========================================

-- Enums
CREATE TYPE public.verification_kind AS ENUM ('tenant', 'landlord', 'property');
CREATE TYPE public.verification_status AS ENUM ('pending', 'verified', 'rejected');
CREATE TYPE public.ticket_status AS ENUM ('open', 'in_progress', 'resolved', 'closed');
CREATE TYPE public.ticket_priority AS ENUM ('low', 'medium', 'high', 'urgent');
CREATE TYPE public.move_kind AS ENUM ('move_in', 'move_out');
CREATE TYPE public.deposit_status AS ENUM ('held', 'partial_refunded', 'refunded', 'forfeited');
CREATE TYPE public.fraud_severity AS ENUM ('low', 'medium', 'high', 'critical');

-- ===== verifications =====
CREATE TABLE public.verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind public.verification_kind NOT NULL,
  -- Subject: tenant_id, owner_id of landlord, or property_id (one of)
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  landlord_user_id uuid,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  -- The landlord who owns/manages this verification (null for landlord self-verification)
  owner_id uuid NOT NULL,
  status public.verification_status NOT NULL DEFAULT 'pending',
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verifications_owner ON public.verifications(owner_id);
CREATE INDEX idx_verifications_status ON public.verifications(status);
CREATE INDEX idx_verifications_tenant ON public.verifications(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verifications TO authenticated;
GRANT ALL ON public.verifications TO service_role;
ALTER TABLE public.verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own or admin read verifications" ON public.verifications
  FOR SELECT USING (auth.uid() = owner_id OR auth.uid() = landlord_user_id OR public.is_admin(auth.uid()));
CREATE POLICY "own insert verifications" ON public.verifications
  FOR INSERT WITH CHECK (auth.uid() = owner_id OR auth.uid() = landlord_user_id);
CREATE POLICY "own or admin update verifications" ON public.verifications
  FOR UPDATE USING (auth.uid() = owner_id OR public.is_admin(auth.uid()));
CREATE POLICY "own delete verifications" ON public.verifications
  FOR DELETE USING (auth.uid() = owner_id);

CREATE TRIGGER trg_verifications_updated BEFORE UPDATE ON public.verifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== verification_documents =====
CREATE TABLE public.verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  verification_id uuid NOT NULL REFERENCES public.verifications(id) ON DELETE CASCADE,
  doc_type text NOT NULL,  -- 'aadhaar' | 'pan' | 'dl' | 'ownership' | 'selfie' | 'profile_photo' | 'property_photo'
  storage_path text NOT NULL,
  uploaded_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_verdocs_verification ON public.verification_documents(verification_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.verification_documents TO authenticated;
GRANT ALL ON public.verification_documents TO service_role;
ALTER TABLE public.verification_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "verdocs read via parent" ON public.verification_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.verifications v WHERE v.id = verification_id
      AND (v.owner_id = auth.uid() OR v.landlord_user_id = auth.uid() OR public.is_admin(auth.uid())))
  );
CREATE POLICY "verdocs insert via parent" ON public.verification_documents
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid() AND EXISTS (
      SELECT 1 FROM public.verifications v WHERE v.id = verification_id
        AND (v.owner_id = auth.uid() OR v.landlord_user_id = auth.uid())
    )
  );
CREATE POLICY "verdocs delete own" ON public.verification_documents
  FOR DELETE USING (uploaded_by = auth.uid() OR public.is_admin(auth.uid()));

-- ===== maintenance_tickets =====
CREATE TABLE public.maintenance_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  room_id uuid REFERENCES public.rooms(id) ON DELETE SET NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  title text NOT NULL,
  description text,
  priority public.ticket_priority NOT NULL DEFAULT 'medium',
  status public.ticket_status NOT NULL DEFAULT 'open',
  photo_paths text[] NOT NULL DEFAULT '{}',
  resolution_notes text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_owner ON public.maintenance_tickets(owner_id);
CREATE INDEX idx_tickets_status ON public.maintenance_tickets(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.maintenance_tickets TO authenticated;
GRANT ALL ON public.maintenance_tickets TO service_role;
ALTER TABLE public.maintenance_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tickets own all" ON public.maintenance_tickets
  FOR ALL USING (auth.uid() = owner_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_tickets_updated BEFORE UPDATE ON public.maintenance_tickets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== move_records =====
CREATE TABLE public.move_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  room_id uuid NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  kind public.move_kind NOT NULL,
  move_date date NOT NULL DEFAULT CURRENT_DATE,
  meter_reading numeric,
  condition_notes text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  checklist jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_moves_owner ON public.move_records(owner_id);
CREATE INDEX idx_moves_tenant ON public.move_records(tenant_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.move_records TO authenticated;
GRANT ALL ON public.move_records TO service_role;
ALTER TABLE public.move_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "moves own all" ON public.move_records
  FOR ALL USING (auth.uid() = owner_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_moves_updated BEFORE UPDATE ON public.move_records
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== deposits =====
CREATE TABLE public.deposits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  amount_held numeric NOT NULL DEFAULT 0,
  amount_deducted numeric NOT NULL DEFAULT 0,
  amount_refunded numeric NOT NULL DEFAULT 0,
  deduction_reason text,
  status public.deposit_status NOT NULL DEFAULT 'held',
  refunded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_deposits_owner ON public.deposits(owner_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposits TO authenticated;
GRANT ALL ON public.deposits TO service_role;
ALTER TABLE public.deposits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deposits own all" ON public.deposits
  FOR ALL USING (auth.uid() = owner_id OR public.is_admin(auth.uid()))
  WITH CHECK (auth.uid() = owner_id);

CREATE TRIGGER trg_deposits_updated BEFORE UPDATE ON public.deposits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ===== fraud_flags =====
CREATE TABLE public.fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,  -- 'duplicate_phone' | 'duplicate_id' | 'payment_fraud' | 'fake_doc' | 'manual'
  severity public.fraud_severity NOT NULL DEFAULT 'medium',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  flagged_by uuid,
  resolved_by uuid,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_fraud_user ON public.fraud_flags(user_id);
CREATE INDEX idx_fraud_unresolved ON public.fraud_flags(resolved) WHERE NOT resolved;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fraud_flags TO authenticated;
GRANT ALL ON public.fraud_flags TO service_role;
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admins all fraud" ON public.fraud_flags
  FOR ALL USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- ===== activity_log =====
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_activity_user ON public.activity_log(user_id);
CREATE INDEX idx_activity_created ON public.activity_log(created_at DESC);

GRANT SELECT, INSERT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own activity insert" ON public.activity_log
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own or admin activity read" ON public.activity_log
  FOR SELECT USING (auth.uid() = user_id OR public.is_admin(auth.uid()));
