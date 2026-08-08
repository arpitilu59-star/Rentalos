-- Roommate Match — extends the existing myr_user_profiles table
-- (already has gender/city/occupation/bio with public-read RLS, so we
-- just add the fields the matching algorithm needs). No new table,
-- no new RLS needed — existing "myr profile public read / own write /
-- own update" policies already cover these new columns correctly.

alter table public.myr_user_profiles
  add column if not exists age integer,
  add column if not exists smoking boolean,
  add column if not exists sleep_schedule text,
  add column if not exists diet text,
  add column if not exists budget_min numeric,
  add column if not exists budget_max numeric,
  add column if not exists looking_for_roommate boolean not null default false;

do $$ begin
  alter table public.myr_user_profiles
    add constraint myr_user_profiles_sleep_schedule_check
    check (sleep_schedule is null or sleep_schedule in ('early_bird','night_owl'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.myr_user_profiles
    add constraint myr_user_profiles_diet_check
    check (diet is null or diet in ('veg','non_veg','vegan'));
exception when duplicate_object then null; end $$;

create index if not exists idx_myr_profiles_looking on public.myr_user_profiles (city) where looking_for_roommate = true;
