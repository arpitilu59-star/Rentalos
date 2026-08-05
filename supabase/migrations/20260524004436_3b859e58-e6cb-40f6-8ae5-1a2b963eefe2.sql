
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS other_charges numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS other_charges_note text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS latitude double precision;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS longitude double precision;
