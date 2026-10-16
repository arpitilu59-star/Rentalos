-- Room availability lifecycle + admin booking verification.
--
-- Problem: accepting a booking set rooms.myr_available=false but left the room published, and
-- nothing ever restored it. Manual "publish" only flipped is_public, so a room whose
-- myr_available was stuck on false never reappeared in browse. The listing now follows occupancy:
--   * every active tenant occupies one of the room's `capacity` slots
--   * room full            -> unpublished + unavailable (remembered as auto_unpublished)
--   * a slot frees up      -> available again, and republished IF it was auto-unpublished
--   * manual unpublish     -> stays unpublished (never auto-republished)
--   * manual publish of a full room is rejected
-- Admin booking review: admins can see who booked what (incl. tenant mobile) and mark it checked.

alter table public.rooms add column if not exists capacity int not null default 1;
alter table public.rooms drop constraint if exists rooms_capacity_range;
alter table public.rooms add constraint rooms_capacity_range check (capacity between 1 and 50);
alter table public.rooms add column if not exists auto_unpublished boolean not null default false;

create or replace function public.room_active_tenants(_room uuid) returns int
language sql stable security definer set search_path to 'public' as $$
  select count(*)::int from public.tenants where room_id = _room and active = true;
$$;

-- Recompute a room's listing state from its occupancy. Idempotent; only called on occupancy changes.
create or replace function public.sync_room_availability(_room uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare _r record; _n int;
begin
  select id, capacity, is_public, auto_unpublished into _r from public.rooms where id = _room for update;
  if not found then return; end if;
  _n := public.room_active_tenants(_room);
  if _n >= _r.capacity then
    update public.rooms
       set myr_available = false,
           auto_unpublished = (auto_unpublished or is_public),
           is_public = false
     where id = _room and (myr_available or is_public);
  else
    update public.rooms
       set myr_available = true,
           is_public = (is_public or auto_unpublished),
           auto_unpublished = false
     where id = _room and (not myr_available or auto_unpublished);
  end if;
end $$;

create or replace function public.trg_tenants_sync_room() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op <> 'INSERT' and old.room_id is not null then
    perform public.sync_room_availability(old.room_id);
  end if;
  if tg_op <> 'DELETE' and new.room_id is not null
     and (tg_op = 'INSERT' or new.room_id is distinct from old.room_id) then
    perform public.sync_room_availability(new.room_id);
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists trg_tenants_sync_room on public.tenants;
create trigger trg_tenants_sync_room after insert or update of active, room_id or delete on public.tenants
  for each row execute function public.trg_tenants_sync_room();

-- Raising/lowering a room's capacity re-evaluates its listing state.
create or replace function public.trg_rooms_capacity_sync() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  perform public.sync_room_availability(new.id);
  return null;
end $$;
drop trigger if exists trg_rooms_capacity_sync on public.rooms;
create trigger trg_rooms_capacity_sync after update of capacity on public.rooms
  for each row when (old.capacity is distinct from new.capacity)
  execute function public.trg_rooms_capacity_sync();

-- A full room can't be published by hand (and a landlord clearing the room doesn't need to).
create or replace function public.trg_rooms_guard_publish() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if new.is_public and not coalesce(old.is_public, false)
     and public.room_active_tenants(new.id) >= new.capacity then
    raise exception 'ROOM_FULL: this room has no vacancy. It is published again automatically when a tenant leaves.';
  end if;
  -- a deliberate manual change clears the "auto" memory so it is never silently reversed later
  if tg_op = 'UPDATE' and new.is_public is distinct from old.is_public
     and new.auto_unpublished = old.auto_unpublished
     and public.room_active_tenants(new.id) < new.capacity then
    new.auto_unpublished := false;
  end if;
  return new;
end $$;
drop trigger if exists trg_rooms_guard_publish on public.rooms;
create trigger trg_rooms_guard_publish before update of is_public on public.rooms
  for each row execute function public.trg_rooms_guard_publish();

-- Heal existing data once: occupied rooms leave the marketplace, vacant rooms stuck on
-- myr_available=false (the "manual publish does nothing" bug) become available again.
do $$
declare r record;
begin
  for r in select id from public.rooms loop
    perform public.sync_room_availability(r.id);
  end loop;
end $$;

-- ---------------- admin booking verification ----------------
alter table public.bookings add column if not exists admin_review text not null default 'unchecked';
alter table public.bookings drop constraint if exists bookings_admin_review_chk;
alter table public.bookings add constraint bookings_admin_review_chk check (admin_review in ('unchecked', 'confirmed', 'suspicious'));
alter table public.bookings add column if not exists admin_note text;
alter table public.bookings add column if not exists admin_reviewed_by uuid;
alter table public.bookings add column if not exists admin_reviewed_at timestamptz;
create index if not exists idx_bookings_admin_review on public.bookings (admin_review, created_at desc);

-- Landlords/tenants may update their own booking rows (accept / cancel); the review columns are admin-only.
create or replace function public.trg_bookings_guard_admin_cols() returns trigger
language plpgsql security definer set search_path to 'public' as $$
begin
  if auth.uid() is not null and coalesce(auth.role(), '') <> 'service_role'
     and (new.admin_review is distinct from old.admin_review
          or new.admin_note is distinct from old.admin_note
          or new.admin_reviewed_by is distinct from old.admin_reviewed_by
          or new.admin_reviewed_at is distinct from old.admin_reviewed_at) then
    raise exception 'Only an admin can review a booking.';
  end if;
  return new;
end $$;
drop trigger if exists trg_bookings_guard_admin_cols on public.bookings;
create trigger trg_bookings_guard_admin_cols before update on public.bookings
  for each row execute function public.trg_bookings_guard_admin_cols();

do $$
declare f text;
begin
  foreach f in array array[
    'room_active_tenants(uuid)', 'sync_room_availability(uuid)', 'trg_tenants_sync_room()',
    'trg_rooms_guard_publish()', 'trg_rooms_capacity_sync()', 'trg_bookings_guard_admin_cols()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
