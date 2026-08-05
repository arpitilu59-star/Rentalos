ALTER TABLE public.rooms
  ADD COLUMN IF NOT EXISTS water_per_person numeric,
  ADD COLUMN IF NOT EXISTS cleaning_amount numeric;