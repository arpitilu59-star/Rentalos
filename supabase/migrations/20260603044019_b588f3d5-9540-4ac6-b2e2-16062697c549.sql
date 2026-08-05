
-- ============================================================
-- MYR (ManageYourRoom) marketplace — Phase 1 schema
-- Fully additive. Does NOT touch any existing RentDesk tables.
-- ============================================================

-- ---------- ENUMS ----------
CREATE TYPE public.myr_role AS ENUM ('tenant','landlord','super_admin');
CREATE TYPE public.myr_listing_type AS ENUM ('pg','room','flat','hostel','shared');
CREATE TYPE public.myr_listing_status AS ENUM ('draft','pending_review','active','rejected','paused','archived');
CREATE TYPE public.myr_room_status AS ENUM ('available','reserved','occupied','maintenance');
CREATE TYPE public.myr_furnishing AS ENUM ('unfurnished','semi','full');
CREATE TYPE public.myr_gender_pref AS ENUM ('any','male','female');
CREATE TYPE public.myr_booking_status AS ENUM ('reserved','confirmed','cancelled','expired','completed');
CREATE TYPE public.myr_verification_kind AS ENUM ('tenant','landlord','property');
CREATE TYPE public.myr_verification_status AS ENUM ('pending','verified','rejected');
CREATE TYPE public.myr_plan AS ENUM ('free','basic','premium','business');
CREATE TYPE public.myr_payment_status AS ENUM ('pending','paid','failed','refunded');

-- ---------- USER ROLES ----------
CREATE TABLE public.myr_user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role myr_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.myr_user_roles TO authenticated;
GRANT ALL ON public.myr_user_roles TO service_role;
ALTER TABLE public.myr_user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own myr roles read" ON public.myr_user_roles FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));
CREATE POLICY "own myr roles insert" ON public.myr_user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.myr_has_role(_uid uuid, _role myr_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.myr_user_roles WHERE user_id = _uid AND role = _role);
$$;
REVOKE EXECUTE ON FUNCTION public.myr_has_role(uuid, myr_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.myr_has_role(uuid, myr_role) TO authenticated;

-- ---------- MYR USER PROFILES (extends profiles, doesn't replace) ----------
CREATE TABLE public.myr_user_profiles (
  user_id uuid PRIMARY KEY,
  display_name text,
  photo_url text,
  bio text,
  city text,
  gender text,
  occupation text,
  verified boolean NOT NULL DEFAULT false,
  account_status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.myr_user_profiles TO authenticated;
GRANT SELECT ON public.myr_user_profiles TO anon;
GRANT ALL ON public.myr_user_profiles TO service_role;
ALTER TABLE public.myr_user_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "myr profile public read" ON public.myr_user_profiles FOR SELECT USING (true);
CREATE POLICY "myr profile own write" ON public.myr_user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "myr profile own update" ON public.myr_user_profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE TRIGGER trg_myr_profile_updated BEFORE UPDATE ON public.myr_user_profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- AMENITIES ----------
CREATE TABLE public.myr_amenities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  label text NOT NULL,
  icon text
);
GRANT SELECT ON public.myr_amenities TO anon, authenticated;
GRANT ALL ON public.myr_amenities TO service_role;
ALTER TABLE public.myr_amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "amenities public read" ON public.myr_amenities FOR SELECT USING (true);

INSERT INTO public.myr_amenities (code,label,icon) VALUES
  ('wifi','Wi-Fi','wifi'),
  ('ac','AC','snowflake'),
  ('parking','Parking','car'),
  ('laundry','Laundry','shirt'),
  ('kitchen','Kitchen','utensils'),
  ('cctv','CCTV','camera'),
  ('lift','Lift','arrow-up'),
  ('power_backup','Power Backup','battery'),
  ('water_24x7','24x7 Water','droplet'),
  ('housekeeping','Housekeeping','sparkles'),
  ('meals','Meals','utensils-crossed'),
  ('gym','Gym','dumbbell');

-- ---------- LISTINGS ----------
CREATE TABLE public.myr_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  type myr_listing_type NOT NULL,
  status myr_listing_status NOT NULL DEFAULT 'draft',
  address_line text,
  city text,
  state text,
  pincode text,
  latitude double precision,
  longitude double precision,
  normalized_address text GENERATED ALWAYS AS (lower(regexp_replace(coalesce(address_line,'')||'|'||coalesce(pincode,''),'\s+','','g'))) STORED,
  rules text,
  response_time_minutes int,
  view_count int NOT NULL DEFAULT 0,
  rating_avg numeric(3,2),
  rating_count int NOT NULL DEFAULT 0,
  approved_at timestamptz,
  approved_by uuid,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_listings_status ON public.myr_listings(status);
CREATE INDEX idx_myr_listings_city ON public.myr_listings(city);
CREATE INDEX idx_myr_listings_landlord ON public.myr_listings(landlord_id);
CREATE UNIQUE INDEX uq_myr_listing_addr ON public.myr_listings(landlord_id, normalized_address) WHERE normalized_address <> '|';
GRANT SELECT ON public.myr_listings TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.myr_listings TO authenticated;
GRANT ALL ON public.myr_listings TO service_role;
ALTER TABLE public.myr_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "listings public read active" ON public.myr_listings FOR SELECT USING (status = 'active' OR auth.uid() = landlord_id OR is_admin(auth.uid()));
CREATE POLICY "listings landlord insert" ON public.myr_listings FOR INSERT WITH CHECK (auth.uid() = landlord_id AND myr_has_role(auth.uid(),'landlord'));
CREATE POLICY "listings landlord update" ON public.myr_listings FOR UPDATE USING (auth.uid() = landlord_id OR is_admin(auth.uid()));
CREATE POLICY "listings landlord delete" ON public.myr_listings FOR DELETE USING (auth.uid() = landlord_id OR is_admin(auth.uid()));
CREATE TRIGGER trg_myr_listings_updated BEFORE UPDATE ON public.myr_listings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- LISTING MEDIA ----------
CREATE TABLE public.myr_listing_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  kind text NOT NULL DEFAULT 'image',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_media_listing ON public.myr_listing_media(listing_id);
GRANT SELECT ON public.myr_listing_media TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.myr_listing_media TO authenticated;
GRANT ALL ON public.myr_listing_media TO service_role;
ALTER TABLE public.myr_listing_media ENABLE ROW LEVEL SECURITY;
CREATE POLICY "media public read" ON public.myr_listing_media FOR SELECT USING (true);
CREATE POLICY "media landlord write" ON public.myr_listing_media FOR ALL
  USING (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND (l.landlord_id = auth.uid() OR is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND l.landlord_id = auth.uid()));

-- ---------- LISTING ROOMS ----------
CREATE TABLE public.myr_listing_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  label text NOT NULL,
  rent numeric NOT NULL,
  deposit numeric NOT NULL DEFAULT 0,
  capacity int NOT NULL DEFAULT 1,
  furnishing myr_furnishing NOT NULL DEFAULT 'unfurnished',
  gender_pref myr_gender_pref NOT NULL DEFAULT 'any',
  status myr_room_status NOT NULL DEFAULT 'available',
  available_from date,
  reserved_until timestamptz,
  reserved_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_rooms_listing ON public.myr_listing_rooms(listing_id);
CREATE INDEX idx_myr_rooms_status ON public.myr_listing_rooms(status);
GRANT SELECT ON public.myr_listing_rooms TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.myr_listing_rooms TO authenticated;
GRANT ALL ON public.myr_listing_rooms TO service_role;
ALTER TABLE public.myr_listing_rooms ENABLE ROW LEVEL SECURITY;
CREATE POLICY "rooms public read" ON public.myr_listing_rooms FOR SELECT USING (true);
CREATE POLICY "rooms landlord write" ON public.myr_listing_rooms FOR ALL
  USING (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND (l.landlord_id = auth.uid() OR is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND l.landlord_id = auth.uid()));
CREATE TRIGGER trg_myr_rooms_updated BEFORE UPDATE ON public.myr_listing_rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- LISTING ⇄ AMENITIES ----------
CREATE TABLE public.myr_listing_amenities (
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  amenity_id uuid NOT NULL REFERENCES public.myr_amenities(id) ON DELETE CASCADE,
  PRIMARY KEY (listing_id, amenity_id)
);
GRANT SELECT ON public.myr_listing_amenities TO anon, authenticated;
GRANT INSERT, DELETE ON public.myr_listing_amenities TO authenticated;
GRANT ALL ON public.myr_listing_amenities TO service_role;
ALTER TABLE public.myr_listing_amenities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "la public read" ON public.myr_listing_amenities FOR SELECT USING (true);
CREATE POLICY "la landlord write" ON public.myr_listing_amenities FOR ALL
  USING (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND (l.landlord_id = auth.uid() OR is_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.myr_listings l WHERE l.id = listing_id AND l.landlord_id = auth.uid()));

-- ---------- INQUIRIES (thread headers) ----------
CREATE TABLE public.myr_inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  landlord_id uuid NOT NULL,
  last_message text,
  unread_for_landlord int NOT NULL DEFAULT 0,
  unread_for_tenant int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, tenant_id)
);
GRANT SELECT, INSERT, UPDATE ON public.myr_inquiries TO authenticated;
GRANT ALL ON public.myr_inquiries TO service_role;
ALTER TABLE public.myr_inquiries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inq parties read" ON public.myr_inquiries FOR SELECT USING (auth.uid() IN (tenant_id, landlord_id) OR is_admin(auth.uid()));
CREATE POLICY "inq tenant insert" ON public.myr_inquiries FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY "inq parties update" ON public.myr_inquiries FOR UPDATE USING (auth.uid() IN (tenant_id, landlord_id));

CREATE TABLE public.myr_inquiry_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id uuid NOT NULL REFERENCES public.myr_inquiries(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_inq_msgs ON public.myr_inquiry_messages(inquiry_id, created_at);
GRANT SELECT, INSERT ON public.myr_inquiry_messages TO authenticated;
GRANT ALL ON public.myr_inquiry_messages TO service_role;
ALTER TABLE public.myr_inquiry_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "msgs parties read" ON public.myr_inquiry_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.myr_inquiries i WHERE i.id = inquiry_id AND (auth.uid() IN (i.tenant_id, i.landlord_id) OR is_admin(auth.uid()))));
CREATE POLICY "msgs parties insert" ON public.myr_inquiry_messages FOR INSERT
  WITH CHECK (auth.uid() = sender_id AND EXISTS (SELECT 1 FROM public.myr_inquiries i WHERE i.id = inquiry_id AND auth.uid() IN (i.tenant_id, i.landlord_id)));

-- ---------- BOOKINGS ----------
CREATE TABLE public.myr_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES public.myr_listing_rooms(id) ON DELETE RESTRICT,
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE RESTRICT,
  tenant_id uuid NOT NULL,
  landlord_id uuid NOT NULL,
  status myr_booking_status NOT NULL DEFAULT 'reserved',
  reserved_until timestamptz,
  move_in_date date,
  stay_months int,
  amount numeric NOT NULL DEFAULT 0,
  deposit numeric NOT NULL DEFAULT 0,
  payment_status myr_payment_status NOT NULL DEFAULT 'pending',
  cancelled_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_bookings_tenant ON public.myr_bookings(tenant_id);
CREATE INDEX idx_myr_bookings_landlord ON public.myr_bookings(landlord_id);
CREATE INDEX idx_myr_bookings_room ON public.myr_bookings(room_id);
-- prevent more than one active (reserved or confirmed) booking per room
CREATE UNIQUE INDEX uq_myr_active_booking_per_room ON public.myr_bookings(room_id)
  WHERE status IN ('reserved','confirmed');
-- prevent multiple active reservations per tenant
CREATE UNIQUE INDEX uq_myr_active_reservation_per_tenant ON public.myr_bookings(tenant_id)
  WHERE status = 'reserved';
GRANT SELECT, INSERT, UPDATE ON public.myr_bookings TO authenticated;
GRANT ALL ON public.myr_bookings TO service_role;
ALTER TABLE public.myr_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bookings parties read" ON public.myr_bookings FOR SELECT
  USING (auth.uid() IN (tenant_id, landlord_id) OR is_admin(auth.uid()));
CREATE POLICY "bookings tenant insert" ON public.myr_bookings FOR INSERT WITH CHECK (auth.uid() = tenant_id);
CREATE POLICY "bookings parties update" ON public.myr_bookings FOR UPDATE
  USING (auth.uid() IN (tenant_id, landlord_id) OR is_admin(auth.uid()));
CREATE TRIGGER trg_myr_bookings_updated BEFORE UPDATE ON public.myr_bookings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Atomic reservation function — prevents double bookings.
CREATE OR REPLACE FUNCTION public.myr_reserve_room(_room_id uuid, _minutes int DEFAULT 10)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _room record;
  _booking_id uuid;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT r.*, l.landlord_id AS l_landlord
  INTO _room
  FROM public.myr_listing_rooms r
  JOIN public.myr_listings l ON l.id = r.listing_id
  WHERE r.id = _room_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Room not found'; END IF;

  -- expire stale reservations
  IF _room.status = 'reserved' AND _room.reserved_until IS NOT NULL AND _room.reserved_until < now() THEN
    UPDATE public.myr_listing_rooms SET status='available', reserved_until=NULL, reserved_by=NULL WHERE id=_room_id;
    UPDATE public.myr_bookings SET status='expired' WHERE room_id=_room_id AND status='reserved';
    _room.status := 'available';
  END IF;

  IF _room.status <> 'available' THEN
    RAISE EXCEPTION 'Room not available';
  END IF;

  UPDATE public.myr_listing_rooms
    SET status='reserved', reserved_until=now() + (_minutes || ' minutes')::interval, reserved_by=_uid
    WHERE id=_room_id;

  INSERT INTO public.myr_bookings (room_id, listing_id, tenant_id, landlord_id, status, reserved_until, amount, deposit)
  VALUES (_room_id, _room.listing_id, _uid, _room.l_landlord, 'reserved', now() + (_minutes || ' minutes')::interval, _room.rent, _room.deposit)
  RETURNING id INTO _booking_id;

  RETURN _booking_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.myr_reserve_room(uuid,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.myr_reserve_room(uuid,int) TO authenticated;

-- ---------- VERIFICATIONS (MYR-specific, separate from existing `verifications`) ----------
CREATE TABLE public.myr_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind myr_verification_kind NOT NULL,
  listing_id uuid REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  status myr_verification_status NOT NULL DEFAULT 'pending',
  id_doc_path text,
  selfie_path text,
  property_doc_path text,
  notes text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_ver_user ON public.myr_verifications(user_id);
GRANT SELECT, INSERT, UPDATE ON public.myr_verifications TO authenticated;
GRANT ALL ON public.myr_verifications TO service_role;
ALTER TABLE public.myr_verifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver own read" ON public.myr_verifications FOR SELECT USING (auth.uid() = user_id OR is_admin(auth.uid()));
CREATE POLICY "ver own insert" ON public.myr_verifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "ver admin update" ON public.myr_verifications FOR UPDATE USING (auth.uid() = user_id OR is_admin(auth.uid()));
CREATE TRIGGER trg_myr_ver_updated BEFORE UPDATE ON public.myr_verifications FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- REVIEWS ----------
CREATE TABLE public.myr_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  booking_id uuid REFERENCES public.myr_bookings(id) ON DELETE SET NULL,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  stay_months int,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (listing_id, tenant_id)
);
CREATE INDEX idx_myr_reviews_listing ON public.myr_reviews(listing_id);
GRANT SELECT ON public.myr_reviews TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.myr_reviews TO authenticated;
GRANT ALL ON public.myr_reviews TO service_role;
ALTER TABLE public.myr_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reviews public read" ON public.myr_reviews FOR SELECT USING (true);
CREATE POLICY "reviews tenant write" ON public.myr_reviews FOR INSERT
  WITH CHECK (auth.uid() = tenant_id AND EXISTS (
    SELECT 1 FROM public.myr_bookings b WHERE b.id = booking_id AND b.tenant_id = auth.uid() AND b.status IN ('confirmed','completed')
  ));
CREATE POLICY "reviews tenant update" ON public.myr_reviews FOR UPDATE USING (auth.uid() = tenant_id);
CREATE POLICY "reviews tenant delete" ON public.myr_reviews FOR DELETE USING (auth.uid() = tenant_id OR is_admin(auth.uid()));

-- ---------- SAVED LISTINGS ----------
CREATE TABLE public.myr_saved_listings (
  user_id uuid NOT NULL,
  listing_id uuid NOT NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, listing_id)
);
GRANT SELECT, INSERT, DELETE ON public.myr_saved_listings TO authenticated;
GRANT ALL ON public.myr_saved_listings TO service_role;
ALTER TABLE public.myr_saved_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "saved own all" ON public.myr_saved_listings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ---------- NOTIFICATIONS ----------
CREATE TABLE public.myr_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_myr_notif_user ON public.myr_notifications(user_id, read_at);
GRANT SELECT, UPDATE ON public.myr_notifications TO authenticated;
GRANT ALL ON public.myr_notifications TO service_role;
ALTER TABLE public.myr_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "notif own read" ON public.myr_notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "notif own update" ON public.myr_notifications FOR UPDATE USING (auth.uid() = user_id);

-- ---------- SUBSCRIPTIONS ----------
CREATE TABLE public.myr_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  landlord_id uuid NOT NULL UNIQUE,
  plan myr_plan NOT NULL DEFAULT 'free',
  active boolean NOT NULL DEFAULT true,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.myr_subscriptions TO authenticated;
GRANT ALL ON public.myr_subscriptions TO service_role;
ALTER TABLE public.myr_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sub own read" ON public.myr_subscriptions FOR SELECT USING (auth.uid() = landlord_id OR is_admin(auth.uid()));
CREATE TRIGGER trg_myr_sub_updated BEFORE UPDATE ON public.myr_subscriptions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------- FRAUD FLAGS (MYR-specific) ----------
CREATE TABLE public.myr_fraud_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  listing_id uuid REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  kind text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.myr_fraud_flags TO authenticated;
GRANT ALL ON public.myr_fraud_flags TO service_role;
ALTER TABLE public.myr_fraud_flags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "fraud admins all" ON public.myr_fraud_flags FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

-- ---------- helper: bump listing rating after review ----------
CREATE OR REPLACE FUNCTION public.myr_recalc_listing_rating()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.myr_listings l SET
    rating_avg = (SELECT round(avg(rating)::numeric, 2) FROM public.myr_reviews WHERE listing_id = l.id),
    rating_count = (SELECT count(*) FROM public.myr_reviews WHERE listing_id = l.id)
  WHERE l.id = COALESCE(NEW.listing_id, OLD.listing_id);
  RETURN COALESCE(NEW, OLD);
END $$;
REVOKE EXECUTE ON FUNCTION public.myr_recalc_listing_rating() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_myr_review_rating AFTER INSERT OR UPDATE OR DELETE ON public.myr_reviews
  FOR EACH ROW EXECUTE FUNCTION public.myr_recalc_listing_rating();
