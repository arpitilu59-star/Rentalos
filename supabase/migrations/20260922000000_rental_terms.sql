-- =====================================================================
-- Rental terms: versioned structured terms per property, and an immutable
-- snapshot of exactly what a tenant acknowledged when requesting a booking.
-- Requires: 20260920000000 (is_trusted_db_session), 20260921000000 (not strictly).
-- All writes happen in SECURITY DEFINER functions callable by service_role only.
-- Existing properties/bookings are untouched: no terms = "not specified".
-- =====================================================================

alter table public.properties
  add column if not exists terms_summary jsonb,
  add column if not exists current_terms_version int;
create index if not exists idx_properties_terms_gin on public.properties using gin (terms_summary jsonb_path_ops);

create table if not exists public.rental_terms_versions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  version int not null check (version >= 1),
  terms jsonb not null,
  terms_hash text not null,
  completeness int not null default 0 check (completeness between 0 and 100),
  change_note text,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (property_id, version)
);
create index if not exists idx_terms_versions_property on public.rental_terms_versions (property_id, version desc);

create table if not exists public.booking_terms_acceptances (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  tenant_user_id uuid not null,
  landlord_id uuid not null,
  property_id uuid not null,
  room_id uuid not null,
  terms_version_id uuid,            -- no FK on purpose: the snapshot below is self-contained
  terms_version int,
  snapshot jsonb not null,
  snapshot_hash text not null,
  acknowledgements jsonb not null,
  listened boolean not null default false,
  accepted_at timestamptz not null default now()
);
create index if not exists idx_terms_accept_landlord on public.booking_terms_acceptances (landlord_id, accepted_at desc);

-- ---- immutability ----
create or replace function public.terms_immutable() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' then
    raise exception 'Rental terms records are immutable.';
  end if;
  -- DELETE: only allowed as part of an FK cascade (property/booking removed), never directly.
  if pg_trigger_depth() > 1 then return old; end if;
  raise exception 'Rental terms records are immutable.';
end $$;
drop trigger if exists trg_terms_versions_immutable on public.rental_terms_versions;
create trigger trg_terms_versions_immutable before update or delete on public.rental_terms_versions
  for each row execute function public.terms_immutable();
drop trigger if exists trg_terms_accept_immutable on public.booking_terms_acceptances;
create trigger trg_terms_accept_immutable before update or delete on public.booking_terms_acceptances
  for each row execute function public.terms_immutable();

-- ---- RLS ----
alter table public.rental_terms_versions enable row level security;
alter table public.booking_terms_acceptances enable row level security;

drop policy if exists "terms versions read" on public.rental_terms_versions;
create policy "terms versions read" on public.rental_terms_versions for select to anon, authenticated
  using (exists (select 1 from public.properties p where p.id = property_id
                  and (p.is_public_listing or p.owner_id = auth.uid() or public.is_admin(auth.uid()))));

drop policy if exists "terms accept read" on public.booking_terms_acceptances;
create policy "terms accept read" on public.booking_terms_acceptances for select to authenticated
  using (tenant_user_id = auth.uid() or landlord_id = auth.uid() or public.is_admin(auth.uid()));

grant select on public.rental_terms_versions to anon, authenticated;
grant select on public.booking_terms_acceptances to authenticated;
grant all on public.rental_terms_versions, public.booking_terms_acceptances to service_role;

-- ---- publish a new terms version (owner only; serialised per property) ----
create or replace function public.publish_rental_terms(
  _owner uuid, _property uuid, _terms jsonb, _completeness int, _note text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _p record; _v int; _id uuid; _hash text;
begin
  select id, owner_id into _p from public.properties where id = _property for update;
  if not found or _p.owner_id <> _owner then raise exception 'Property not found.'; end if;
  if _terms is null or jsonb_typeof(_terms) <> 'object' then raise exception 'Invalid terms.'; end if;
  _hash := encode(sha256(convert_to(_terms::text, 'UTF8')), 'hex');
  select coalesce(max(version), 0) + 1 into _v from public.rental_terms_versions where property_id = _property;
  -- no-op protection: identical to the current version -> do not create a new one
  if exists (select 1 from public.rental_terms_versions where property_id = _property and version = _v - 1 and terms_hash = _hash) then
    raise exception 'No changes to publish.';
  end if;
  insert into public.rental_terms_versions (property_id, version, terms, terms_hash, completeness, change_note, created_by)
    values (_property, _v, _terms, _hash, coalesce(_completeness, 0), nullif(trim(_note), ''), _owner) returning id into _id;
  update public.properties set terms_summary = _terms, current_terms_version = _v where id = _property;
  insert into public.activity_log (user_id, action, target_type, target_id, metadata)
    values (_owner, 'terms_version_created', 'property', _property::text,
            jsonb_build_object('version', _v, 'completeness', coalesce(_completeness, 0), 'hash', _hash));
  return jsonb_build_object('id', _id, 'version', _v);
end $$;

-- ---- tenant acknowledges terms for a pending booking (snapshot built from DB, never from the client) ----
create or replace function public.record_terms_acceptance(
  _user uuid, _booking uuid, _acks jsonb, _listened boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _b record; _p record; _r record; _tv record; _snap jsonb; _hash text; _id uuid; _k text;
begin
  select * into _b from public.bookings where id = _booking;
  if not found or _b.tenant_user_id <> _user then raise exception 'Booking not found.'; end if;
  if _b.status <> 'pending' then raise exception 'Terms can only be accepted on a pending booking.'; end if;
  if exists (select 1 from public.booking_terms_acceptances where booking_id = _booking) then
    raise exception 'Terms were already accepted for this booking.';
  end if;
  select id, name, city, owner_id, current_terms_version into _p from public.properties where id = _b.property_id;
  select id, room_number, rent_amount, myr_deposit into _r from public.rooms where id = _b.room_id;
  select * into _tv from public.rental_terms_versions where property_id = _b.property_id and version = _p.current_terms_version;
  if _tv.id is not null then
    foreach _k in array array['rent_and_deposit','notice_and_lock_in','house_rules','charges_and_electricity','responsibilities'] loop
      if coalesce(_acks ->> _k, 'false') <> 'true' then
        raise exception 'Please tick every acknowledgement before continuing (missing: %).', _k;
      end if;
    end loop;
  end if;
  _snap := jsonb_build_object(
    'property', jsonb_build_object('id', _p.id, 'name', _p.name, 'city', _p.city),
    'room', jsonb_build_object('id', _r.id, 'room_number', _r.room_number, 'rent_amount', _r.rent_amount, 'deposit', _r.myr_deposit),
    'terms_status', case when _tv.id is null then 'NOT_SPECIFIED' else 'SPECIFIED' end,
    'terms_version', _tv.version,
    'terms', _tv.terms);
  _hash := encode(sha256(convert_to(_snap::text, 'UTF8')), 'hex');
  insert into public.booking_terms_acceptances (booking_id, tenant_user_id, landlord_id, property_id, room_id,
      terms_version_id, terms_version, snapshot, snapshot_hash, acknowledgements, listened)
    values (_booking, _user, _b.landlord_id, _b.property_id, _b.room_id, _tv.id, _tv.version, _snap, _hash,
            coalesce(_acks, '{}'::jsonb), coalesce(_listened, false)) returning id into _id;
  insert into public.activity_log (user_id, action, target_type, target_id, metadata)
    values (_user, 'terms_accepted', 'booking', _booking::text,
            jsonb_build_object('version', _tv.version, 'hash', _hash, 'listened', coalesce(_listened, false), 'status', _snap->>'terms_status'));
  begin
    perform public.notify_user(_b.landlord_id, 'booking_terms_accepted', 'New booking request with accepted terms',
      coalesce(_b.tenant_name, 'A tenant') || ' accepted your rental terms' || coalesce(' (v' || _tv.version || ')', '') || '.', '/bookings');
  exception when others then null; end;
  return jsonb_build_object('id', _id, 'hash', _hash, 'terms_version', _tv.version);
end $$;

-- ---- has this tenant (via their original booking) accepted terms? used by the pre-payment gate ----
create or replace function public.terms_gate_status(_tenant_id uuid) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare _b record; _cur int; _first timestamptz;
begin
  select b.id, b.property_id, b.created_at into _b from public.bookings b where b.tenant_id = _tenant_id order by b.created_at desc limit 1;
  if not found then return 'LEGACY'; end if;                         -- no booking trail: old tenant, never blocked
  if exists (select 1 from public.booking_terms_acceptances a where a.booking_id = _b.id) then return 'ACCEPTED'; end if;
  select current_terms_version into _cur from public.properties where id = _b.property_id;
  select min(created_at) into _first from public.rental_terms_versions where property_id = _b.property_id;
  -- landlord never published terms, or the booking predates them: nothing to accept (never blocks old tenants)
  if _cur is null or _first is null or _b.created_at < _first then return 'NOT_SPECIFIED'; end if;
  return 'REQUIRED';
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'publish_rental_terms(uuid,uuid,jsonb,int,text)',
    'record_terms_acceptance(uuid,uuid,jsonb,boolean)',
    'terms_gate_status(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
