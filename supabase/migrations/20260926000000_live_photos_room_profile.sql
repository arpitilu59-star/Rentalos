-- 1) Storage buckets for live video (idempotent; the bucket was never created by a migration before)
--    and live photos.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-feed-videos', 'live-feed-videos', false, 104857600,
        array['video/mp4','video/webm','video/quicktime'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('live-feed-photos', 'live-feed-photos', true, 8388608, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "lfp owner upload" on storage.objects;
create policy "lfp owner upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'live-feed-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "lfp public read" on storage.objects;
create policy "lfp public read" on storage.objects for select using (bucket_id = 'live-feed-photos');
drop policy if exists "lfp owner delete" on storage.objects;
create policy "lfp owner delete" on storage.objects for delete to authenticated
  using (bucket_id = 'live-feed-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- 2) Live photos: camera-only photos with GPS, shown on the listing once verified.
create table if not exists public.live_feed_photos (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  room_id uuid references public.rooms(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  storage_path text not null,
  caption text,
  captured_lat double precision,
  captured_lng double precision,
  distance_m double precision,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','verified','flagged','rejected')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  check ((room_id is not null) <> (property_id is not null))
);
create index if not exists idx_lfp_room on public.live_feed_photos (room_id, created_at desc) where room_id is not null;
create index if not exists idx_lfp_property on public.live_feed_photos (property_id) where property_id is not null;
create index if not exists idx_lfp_status on public.live_feed_photos (verification_status, created_at);

alter table public.live_feed_photos enable row level security;
grant select on public.live_feed_photos to anon, authenticated;
grant insert, update, delete on public.live_feed_photos to authenticated;
grant all on public.live_feed_photos to service_role;

drop policy if exists "lfp owner manages" on public.live_feed_photos;
create policy "lfp owner manages" on public.live_feed_photos for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "lfp public reads verified" on public.live_feed_photos;
create policy "lfp public reads verified" on public.live_feed_photos for select to anon, authenticated
  using (verification_status = 'verified' and (expires_at is null or expires_at > now()));

-- Owners can't verify their own photos: only the server (service_role) may change review columns.
create or replace function public.trg_lfp_guard() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    if coalesce(auth.role(), '') <> 'service_role' then
      new.verification_status := 'pending'; new.reviewed_by := null; new.reviewed_at := null; new.expires_at := null;
    end if;
  elsif coalesce(auth.role(), '') <> 'service_role' and auth.uid() is not null
     and (new.verification_status is distinct from old.verification_status
          or new.reviewed_by is distinct from old.reviewed_by
          or new.expires_at is distinct from old.expires_at) then
    raise exception 'Only the platform can verify a photo.';
  end if;
  return new;
end $$;
drop trigger if exists trg_lfp_guard on public.live_feed_photos;
create trigger trg_lfp_guard before insert or update on public.live_feed_photos
  for each row execute function public.trg_lfp_guard();

-- 3) Who will live in the room, and how big is it — required BEFORE a room can be published.
alter table public.rooms add column if not exists occupant_type text;
alter table public.rooms add column if not exists room_size text;
alter table public.rooms drop constraint if exists rooms_occupant_type_chk;
alter table public.rooms add constraint rooms_occupant_type_chk
  check (occupant_type is null or occupant_type in ('boys','girls','family','anyone'));
alter table public.rooms drop constraint if exists rooms_room_size_chk;
alter table public.rooms add constraint rooms_room_size_chk
  check (room_size is null or room_size in ('single_room','shared_room','1rk','1bhk','2bhk','3bhk','4bhk_plus'));

create or replace function public.trg_rooms_guard_profile() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  -- A manual publish needs the profile. Automatic republish after a tenant leaves (auto_unpublished) never blocks.
  if new.is_public and not coalesce(old.is_public, false) and not coalesce(old.auto_unpublished, false)
     and (new.occupant_type is null or new.room_size is null) then
    raise exception 'ROOM_PROFILE_INCOMPLETE: choose who the room is for (boys / girls / family) and the room size (1 RK, 1 BHK, 2 BHK...) before publishing.';
  end if;
  return new;
end $$;
drop trigger if exists trg_rooms_guard_profile on public.rooms;
create trigger trg_rooms_guard_profile before update of is_public on public.rooms
  for each row execute function public.trg_rooms_guard_profile();

do $$
declare f text;
begin
  foreach f in array array['trg_lfp_guard()', 'trg_rooms_guard_profile()'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
