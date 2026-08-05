
-- Settings (singleton row)
CREATE TABLE public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cleaning_amount NUMERIC NOT NULL DEFAULT 250,
  water_per_person NUMERIC NOT NULL DEFAULT 100,
  electricity_per_unit NUMERIC NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO public.settings (cleaning_amount, water_per_person, electricity_per_unit) VALUES (250, 100, 10);

CREATE TABLE public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL UNIQUE,
  rent_amount NUMERIC NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  persons INT NOT NULL DEFAULT 1,
  move_in_date DATE NOT NULL DEFAULT CURRENT_DATE,
  rent_share NUMERIC,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.meter_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  reading NUMERIC NOT NULL,
  reading_date DATE NOT NULL DEFAULT CURRENT_DATE,
  photo_path TEXT,
  ai_detected BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
  -- rent (advance / next month)
  rent_period_start DATE NOT NULL,
  rent_period_end DATE NOT NULL,
  rent_amount NUMERIC NOT NULL DEFAULT 0,
  -- electricity (previous month)
  elec_period_start DATE,
  elec_period_end DATE,
  prev_reading NUMERIC DEFAULT 0,
  curr_reading NUMERIC DEFAULT 0,
  units_consumed NUMERIC DEFAULT 0,
  electricity_amount NUMERIC DEFAULT 0,
  -- water + cleaning
  persons INT NOT NULL DEFAULT 1,
  water_amount NUMERIC DEFAULT 0,
  cleaning_amount NUMERIC DEFAULT 0,
  total_amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | paid
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_rooms_updated BEFORE UPDATE ON public.rooms FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_bills_updated BEFORE UPDATE ON public.bills FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS: single-user app, allow public access (no auth)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meter_readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "public all" ON public.settings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.rooms FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.tenants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.meter_readings FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "public all" ON public.bills FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket for meter photos
INSERT INTO storage.buckets (id, name, public) VALUES ('meter-photos', 'meter-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "meter photos public read" ON storage.objects FOR SELECT USING (bucket_id = 'meter-photos');
CREATE POLICY "meter photos public insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'meter-photos');
CREATE POLICY "meter photos public update" ON storage.objects FOR UPDATE USING (bucket_id = 'meter-photos');
CREATE POLICY "meter photos public delete" ON storage.objects FOR DELETE USING (bucket_id = 'meter-photos');
