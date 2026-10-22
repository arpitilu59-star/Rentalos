-- RentDesk landlord app: tenant gender (room compatibility) + meter photo location.
-- Both nullable and additive; existing rows and the web app are unaffected.

alter table public.tenants
  add column if not exists gender text;

do $$ begin
  alter table public.tenants add constraint tenants_gender_check
    check (gender is null or gender in ('male','female','other'));
exception when duplicate_object then null; end $$;

alter table public.meter_readings
  add column if not exists photo_lat double precision,
  add column if not exists photo_lng double precision;

do $$ begin
  alter table public.meter_readings add constraint meter_readings_photo_geo_check
    check ((photo_lat is null and photo_lng is null)
        or (photo_lat between -90 and 90 and photo_lng between -180 and 180));
exception when duplicate_object then null; end $$;
