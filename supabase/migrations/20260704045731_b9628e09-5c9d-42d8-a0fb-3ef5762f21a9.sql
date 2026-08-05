
-- =========================================================
-- Turn 1 + 4: Payment fixes + Notifications infrastructure
-- =========================================================

-- --- 1) Ensure landlord SELECT on their own payments (belt & braces) ---
DROP POLICY IF EXISTS "landlord read own payments" ON public.payments;
CREATE POLICY "landlord read own payments" ON public.payments
FOR SELECT TO authenticated USING (auth.uid() = owner_id);

-- --- 2) NOTIFICATIONS: helper fn to insert ---
CREATE OR REPLACE FUNCTION public.notify_user(_user uuid, _kind text, _title text, _body text, _link text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF _user IS NULL THEN RETURN; END IF;
  INSERT INTO public.myr_notifications (user_id, kind, title, body, link)
  VALUES (_user, _kind, _title, _body, _link);
END $$;

-- --- 3) Trigger: payment proof submitted → notify landlord ---
CREATE OR REPLACE FUNCTION public.trg_payment_submitted()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _tname text; _rnum text;
BEGIN
  IF NEW.verification_status IN ('submitted','pending') THEN
    SELECT t.name, r.room_number INTO _tname, _rnum
      FROM public.bills b
      LEFT JOIN public.tenants t ON t.id = b.tenant_id
      LEFT JOIN public.rooms r ON r.id = b.room_id
      WHERE b.id = NEW.bill_id;
    PERFORM public.notify_user(NEW.owner_id, 'payment_submitted',
      'Payment proof received',
      COALESCE(_tname,'Tenant') || ' · Room ' || COALESCE(_rnum,'-') || ' · ₹' || NEW.amount::text,
      '/payment-verify');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_submitted ON public.payments;
CREATE TRIGGER trg_payment_submitted AFTER INSERT ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_submitted();

-- --- 4) Trigger: payment verified / rejected → notify tenant ---
CREATE OR REPLACE FUNCTION public.trg_payment_verified()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status <> OLD.verification_status
     AND NEW.verification_status IN ('verified','rejected')
     AND NEW.tenant_user_id IS NOT NULL THEN
    PERFORM public.notify_user(NEW.tenant_user_id,
      'payment_' || NEW.verification_status,
      CASE WHEN NEW.verification_status='verified' THEN 'Payment verified ✓' ELSE 'Payment rejected' END,
      '₹' || NEW.amount::text || CASE WHEN NEW.verification_status='rejected' THEN ' — please contact landlord.' ELSE '' END,
      '/tenant');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_payment_verified ON public.payments;
CREATE TRIGGER trg_payment_verified AFTER UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.trg_payment_verified();

-- --- 5) Trigger: bill created → notify tenant ---
CREATE OR REPLACE FUNCTION public.trg_bill_created()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  SELECT tenant_user_id INTO _uid FROM public.tenants WHERE id = NEW.tenant_id;
  IF _uid IS NOT NULL THEN
    PERFORM public.notify_user(_uid, 'bill_new',
      'New bill for ' || to_char(NEW.rent_period_start,'Mon YYYY'),
      '₹' || NEW.total_amount::text || ' · due ' || to_char(NEW.due_date,'DD Mon'),
      '/tenant');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bill_created ON public.bills;
CREATE TRIGGER trg_bill_created AFTER INSERT ON public.bills
FOR EACH ROW EXECUTE FUNCTION public.trg_bill_created();

-- --- 6) Trigger: meter reading uploaded → notify landlord (if not owner) ---
CREATE OR REPLACE FUNCTION public.trg_meter_uploaded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM NEW.owner_id THEN
    PERFORM public.notify_user(NEW.owner_id, 'meter_uploaded',
      'Meter reading uploaded',
      'Reading: ' || NEW.reading::text || ' units',
      '/meters');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_meter_uploaded ON public.meter_readings;
CREATE TRIGGER trg_meter_uploaded AFTER INSERT ON public.meter_readings
FOR EACH ROW EXECUTE FUNCTION public.trg_meter_uploaded();

-- --- 7) Trigger: booking created / status → notify ---
CREATE OR REPLACE FUNCTION public.trg_booking_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE _owner uuid;
BEGIN
  SELECT owner_id INTO _owner FROM public.rooms WHERE id = NEW.room_id;
  IF TG_OP='INSERT' THEN
    PERFORM public.notify_user(_owner, 'booking_new',
      'New booking request', 'Someone requested to book a room.', '/bookings');
  ELSIF TG_OP='UPDATE' AND NEW.status <> OLD.status AND NEW.tenant_user_id IS NOT NULL THEN
    PERFORM public.notify_user(NEW.tenant_user_id, 'booking_'||NEW.status,
      'Booking ' || NEW.status,
      'Your booking is now ' || NEW.status || '.',
      '/tenant');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_booking_ins ON public.bookings;
CREATE TRIGGER trg_booking_ins AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_booking_event();
DROP TRIGGER IF EXISTS trg_booking_upd ON public.bookings;
CREATE TRIGGER trg_booking_upd AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_booking_event();

-- --- 8) Cron: daily bill reminder (bills due within 3 days, not paid) ---
CREATE OR REPLACE FUNCTION public.cron_bill_reminders()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT b.id, b.due_date, b.total_amount, b.amount_paid, b.tenant_id, b.owner_id,
           t.tenant_user_id, t.name AS tname
    FROM public.bills b
    JOIN public.tenants t ON t.id = b.tenant_id
    WHERE b.status <> 'paid'
      AND b.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
      AND (b.last_reminded_at IS NULL OR b.last_reminded_at < now() - INTERVAL '20 hours')
  LOOP
    PERFORM public.notify_user(r.tenant_user_id, 'bill_due_soon',
      'Rent due ' || to_char(r.due_date,'DD Mon'),
      '₹' || (r.total_amount - COALESCE(r.amount_paid,0))::text || ' outstanding',
      '/tenant');
    PERFORM public.notify_user(r.owner_id, 'bill_landlord_reminder',
      'Bill due soon — ' || COALESCE(r.tname,'tenant'),
      '₹' || (r.total_amount - COALESCE(r.amount_paid,0))::text || ' due ' || to_char(r.due_date,'DD Mon'),
      '/bills');
    UPDATE public.bills SET last_reminded_at = now() WHERE id = r.id;
  END LOOP;
END $$;

-- Enable & schedule
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('bill-reminders-daily');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('bill-reminders-daily', '0 9 * * *', $$SELECT public.cron_bill_reminders()$$);

-- --- 9) Enable realtime on notifications & payments so UI syncs live ---
ALTER PUBLICATION supabase_realtime ADD TABLE public.myr_notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
