
-- Live Verified Feed: videos + status flags on listings/rooms/properties

CREATE TYPE public.live_feed_status AS ENUM ('pending','verified','flagged','rejected');

CREATE TABLE public.live_feed_videos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  -- exactly one of these four target refs is set
  myr_listing_id uuid NULL REFERENCES public.myr_listings(id) ON DELETE CASCADE,
  myr_room_id uuid NULL REFERENCES public.myr_listing_rooms(id) ON DELETE CASCADE,
  property_id uuid NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  room_id uuid NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  mime_type text,
  duration_seconds integer,
  captured_lat double precision,
  captured_lng double precision,
  target_lat double precision,
  target_lng double precision,
  distance_m double precision,
  random_prompt text NOT NULL,
  verification_status public.live_feed_status NOT NULL DEFAULT 'pending',
  verification_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT live_feed_target_check CHECK (
    (CASE WHEN myr_listing_id IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN myr_room_id     IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN property_id     IS NOT NULL THEN 1 ELSE 0 END
   + CASE WHEN room_id         IS NOT NULL THEN 1 ELSE 0 END) = 1
  )
);

CREATE INDEX idx_lfv_myr_listing ON public.live_feed_videos(myr_listing_id) WHERE myr_listing_id IS NOT NULL;
CREATE INDEX idx_lfv_myr_room    ON public.live_feed_videos(myr_room_id)    WHERE myr_room_id IS NOT NULL;
CREATE INDEX idx_lfv_property    ON public.live_feed_videos(property_id)    WHERE property_id IS NOT NULL;
CREATE INDEX idx_lfv_room        ON public.live_feed_videos(room_id)        WHERE room_id IS NOT NULL;
CREATE INDEX idx_lfv_owner       ON public.live_feed_videos(owner_id);
CREATE INDEX idx_lfv_status      ON public.live_feed_videos(verification_status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.live_feed_videos TO authenticated;
GRANT SELECT ON public.live_feed_videos TO anon;
GRANT ALL ON public.live_feed_videos TO service_role;

ALTER TABLE public.live_feed_videos ENABLE ROW LEVEL SECURITY;

-- Owner can manage their own uploads
CREATE POLICY "owner manages own live feed videos"
  ON public.live_feed_videos FOR ALL
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- Public can read only verified videos (for public browse)
CREATE POLICY "public reads verified videos"
  ON public.live_feed_videos FOR SELECT
  TO anon, authenticated
  USING (verification_status = 'verified');

-- Admins can read everything
CREATE POLICY "admins read all live feed videos"
  ON public.live_feed_videos FOR SELECT
  TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE POLICY "admins update live feed videos"
  ON public.live_feed_videos FOR UPDATE
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_lfv_updated_at
  BEFORE UPDATE ON public.live_feed_videos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Add has_verified_video flags on targets
ALTER TABLE public.myr_listings       ADD COLUMN IF NOT EXISTS has_verified_video boolean NOT NULL DEFAULT false;
ALTER TABLE public.myr_listing_rooms  ADD COLUMN IF NOT EXISTS has_verified_video boolean NOT NULL DEFAULT false;
ALTER TABLE public.properties         ADD COLUMN IF NOT EXISTS has_verified_video boolean NOT NULL DEFAULT false;
ALTER TABLE public.rooms              ADD COLUMN IF NOT EXISTS has_verified_video boolean NOT NULL DEFAULT false;

-- Trigger: recompute has_verified_video on any change
CREATE OR REPLACE FUNCTION public.trg_lfv_sync_flags()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _ml uuid; _mr uuid; _p uuid; _r uuid;
BEGIN
  _ml := COALESCE(NEW.myr_listing_id, OLD.myr_listing_id);
  _mr := COALESCE(NEW.myr_room_id,    OLD.myr_room_id);
  _p  := COALESCE(NEW.property_id,    OLD.property_id);
  _r  := COALESCE(NEW.room_id,        OLD.room_id);

  IF _ml IS NOT NULL THEN
    UPDATE public.myr_listings SET has_verified_video =
      EXISTS (SELECT 1 FROM public.live_feed_videos WHERE myr_listing_id = _ml AND verification_status='verified')
    WHERE id = _ml;
  END IF;
  IF _mr IS NOT NULL THEN
    UPDATE public.myr_listing_rooms SET has_verified_video =
      EXISTS (SELECT 1 FROM public.live_feed_videos WHERE myr_room_id = _mr AND verification_status='verified')
    WHERE id = _mr;
  END IF;
  IF _p IS NOT NULL THEN
    UPDATE public.properties SET has_verified_video =
      EXISTS (SELECT 1 FROM public.live_feed_videos WHERE property_id = _p AND verification_status='verified')
    WHERE id = _p;
  END IF;
  IF _r IS NOT NULL THEN
    UPDATE public.rooms SET has_verified_video =
      EXISTS (SELECT 1 FROM public.live_feed_videos WHERE room_id = _r AND verification_status='verified')
    WHERE id = _r;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_lfv_sync
  AFTER INSERT OR UPDATE OF verification_status OR DELETE
  ON public.live_feed_videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lfv_sync_flags();

-- Notify owner when video status changes
CREATE OR REPLACE FUNCTION public.trg_lfv_notify()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    PERFORM public.notify_user(NEW.owner_id, 'live_feed_uploaded',
      'Live feed uploaded',
      'Verification in progress ('|| NEW.verification_status ||').',
      '/');
  ELSIF TG_OP='UPDATE' AND NEW.verification_status <> OLD.verification_status THEN
    PERFORM public.notify_user(NEW.owner_id, 'live_feed_'||NEW.verification_status,
      'Live feed ' || NEW.verification_status,
      CASE NEW.verification_status
        WHEN 'verified' THEN 'Your live video is now verified ✓'
        WHEN 'flagged'  THEN 'Video flagged — location mismatch. Admin review needed.'
        WHEN 'rejected' THEN 'Video rejected by admin.'
        ELSE 'Status updated.'
      END,
      '/');
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_lfv_notify_ins
  AFTER INSERT ON public.live_feed_videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lfv_notify();
CREATE TRIGGER trg_lfv_notify_upd
  AFTER UPDATE OF verification_status ON public.live_feed_videos
  FOR EACH ROW EXECUTE FUNCTION public.trg_lfv_notify();
