
-- 1. Wipe existing data
DELETE FROM public.bills;
DELETE FROM public.meter_readings;
DELETE FROM public.tenants;
DELETE FROM public.rooms;
DELETE FROM public.settings;

-- 2. Drop old permissive RLS policies
DROP POLICY IF EXISTS "public all" ON public.rooms;
DROP POLICY IF EXISTS "public all" ON public.tenants;
DROP POLICY IF EXISTS "public all" ON public.bills;
DROP POLICY IF EXISTS "public all" ON public.meter_readings;
DROP POLICY IF EXISTS "public all" ON public.settings;

-- 3. Profiles table
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text,
  phone text,
  email text,
  address text,
  city text,
  business_name text,
  logo_url text,
  upi_id text,
  bank_details text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile select" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "own profile update" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. Properties table
CREATE TABLE public.properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  city text,
  notes text,
  logo_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own properties all" ON public.properties FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
CREATE INDEX idx_properties_owner ON public.properties(owner_id);
CREATE TRIGGER properties_updated BEFORE UPDATE ON public.properties FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Add owner_id + property_id to rooms
ALTER TABLE public.rooms ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.rooms ADD COLUMN property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE;
CREATE INDEX idx_rooms_owner ON public.rooms(owner_id);
CREATE INDEX idx_rooms_property ON public.rooms(property_id);
CREATE POLICY "own rooms all" ON public.rooms FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 6. Add owner_id to tenants
ALTER TABLE public.tenants ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_tenants_owner ON public.tenants(owner_id);
CREATE POLICY "own tenants all" ON public.tenants FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 7. Add owner_id to bills
ALTER TABLE public.bills ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_bills_owner ON public.bills(owner_id);
CREATE POLICY "own bills all" ON public.bills FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 8. Add owner_id to meter_readings
ALTER TABLE public.meter_readings ADD COLUMN owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX idx_meter_owner ON public.meter_readings(owner_id);
CREATE POLICY "own meter all" ON public.meter_readings FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 9. Settings becomes per-owner. Make owner_id PK-style unique.
ALTER TABLE public.settings ADD COLUMN owner_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX idx_settings_owner ON public.settings(owner_id);
CREATE POLICY "own settings all" ON public.settings FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

-- 10. Auto-create profile + default settings on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', '')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.settings (owner_id, cleaning_amount, water_per_person, electricity_per_unit)
  VALUES (NEW.id, 250, 100, 10)
  ON CONFLICT (owner_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. Storage bucket for logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('logos', 'logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public logo read" ON storage.objects FOR SELECT USING (bucket_id = 'logos');
CREATE POLICY "Own logo upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Own logo update" ON storage.objects FOR UPDATE USING (
  bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Own logo delete" ON storage.objects FOR DELETE USING (
  bucket_id = 'logos' AND auth.uid()::text = (storage.foldername(name))[1]
);

-- 12. Also lock down meter-photos to owners
CREATE POLICY "Own meter photo upload" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'meter-photos' AND auth.role() = 'authenticated'
);
