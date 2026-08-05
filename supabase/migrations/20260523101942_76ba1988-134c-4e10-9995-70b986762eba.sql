
-- Add initial meter reading on move-in
ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS initial_reading numeric,
  ADD COLUMN IF NOT EXISTS initial_reading_date date,
  ADD COLUMN IF NOT EXISTS initial_reading_photo text;

-- Partial payment support + reminder control on bills
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS amount_paid numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminders_paused_until date,
  ADD COLUMN IF NOT EXISTS last_reminded_at timestamptz,
  ADD COLUMN IF NOT EXISTS whatsapp_sent_at timestamptz;

-- Expand status to allow 'partial'
ALTER TABLE public.bills DROP CONSTRAINT IF EXISTS bills_status_check;
ALTER TABLE public.bills
  ADD CONSTRAINT bills_status_check CHECK (status IN ('pending','partial','paid'));

-- Profile: store Twilio WhatsApp sender + business hours pref
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS whatsapp_from text;

-- Payment ledger (for partial payment history)
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  bill_id uuid NOT NULL,
  amount numeric NOT NULL,
  paid_on date NOT NULL DEFAULT CURRENT_DATE,
  method text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own payments all" ON public.payments;
CREATE POLICY "own payments all" ON public.payments
  FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
