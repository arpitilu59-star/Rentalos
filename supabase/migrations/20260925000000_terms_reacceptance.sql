-- Re-accept flow: when a landlord publishes a NEW terms version after a tenant's booking, the tenant
-- can review and re-accept it. Append-only (a booking can have many re-acceptances); the original
-- acceptance is never touched.
create table if not exists public.booking_terms_reacceptances (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  tenant_user_id uuid not null,
  landlord_id uuid not null,
  property_id uuid not null,
  terms_version_id uuid,
  terms_version int not null,
  snapshot jsonb not null,
  snapshot_hash text not null,
  acknowledgements jsonb not null,
  listened boolean not null default false,
  accepted_at timestamptz not null default now(),
  unique (booking_id, terms_version)
);
create index if not exists idx_terms_reaccept_booking on public.booking_terms_reacceptances (booking_id, terms_version desc);
create index if not exists idx_terms_reaccept_landlord on public.booking_terms_reacceptances (landlord_id, accepted_at desc);

drop trigger if exists trg_terms_reaccept_immutable on public.booking_terms_reacceptances;
create trigger trg_terms_reaccept_immutable before update or delete on public.booking_terms_reacceptances
  for each row execute function public.terms_immutable();

alter table public.booking_terms_reacceptances enable row level security;
drop policy if exists "reaccept tenant read" on public.booking_terms_reacceptances;
create policy "reaccept tenant read" on public.booking_terms_reacceptances for select to authenticated
  using (tenant_user_id = auth.uid() or landlord_id = auth.uid());

-- Latest version the tenant has accepted for this booking (original or re-acceptance), and the current one.
create or replace function public.terms_reaccept_status(_booking uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare _b record; _cur int; _acc int;
begin
  select * into _b from public.bookings where id = _booking;
  if not found then return jsonb_build_object('needs', false); end if;
  select current_terms_version into _cur from public.properties where id = _b.property_id;
  select max(v) into _acc from (
    select terms_version v from public.booking_terms_acceptances where booking_id = _booking
    union all select terms_version from public.booking_terms_reacceptances where booking_id = _booking) x;
  return jsonb_build_object('current_version', _cur, 'accepted_version', _acc,
    'needs', _cur is not null and _acc is not null and _cur > _acc);
end $$;

create or replace function public.record_terms_reacceptance(
  _user uuid, _booking uuid, _acks jsonb, _listened boolean) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _b record; _p record; _r record; _tv record; _st jsonb; _snap jsonb; _hash text; _id uuid; _k text;
begin
  select * into _b from public.bookings where id = _booking;
  if not found or _b.tenant_user_id <> _user then raise exception 'Booking not found.'; end if;
  if _b.status not in ('pending','accepted') then raise exception 'This booking is closed.'; end if;
  _st := public.terms_reaccept_status(_booking);
  if not (_st->>'needs')::boolean then raise exception 'You have already accepted the latest terms.'; end if;
  select id, name, city, current_terms_version into _p from public.properties where id = _b.property_id;
  select id, room_number, rent_amount, myr_deposit into _r from public.rooms where id = _b.room_id;
  select * into _tv from public.rental_terms_versions where property_id = _b.property_id and version = _p.current_terms_version;
  if _tv.id is null then raise exception 'Terms not found.'; end if;
  foreach _k in array array['rent_and_deposit','notice_and_lock_in','house_rules','charges_and_electricity','responsibilities'] loop
    if coalesce(_acks ->> _k, 'false') <> 'true' then
      raise exception 'Please tick every acknowledgement before continuing (missing: %).', _k;
    end if;
  end loop;
  _snap := jsonb_build_object(
    'property', jsonb_build_object('id', _p.id, 'name', _p.name, 'city', _p.city),
    'room', jsonb_build_object('id', _r.id, 'room_number', _r.room_number, 'rent_amount', _r.rent_amount, 'deposit', _r.myr_deposit),
    'terms_status', 'SPECIFIED', 'terms_version', _tv.version, 'terms', _tv.terms);
  _hash := encode(sha256(convert_to(_snap::text, 'UTF8')), 'hex');
  insert into public.booking_terms_reacceptances (booking_id, tenant_user_id, landlord_id, property_id,
      terms_version_id, terms_version, snapshot, snapshot_hash, acknowledgements, listened)
    values (_booking, _user, _b.landlord_id, _b.property_id, _tv.id, _tv.version, _snap, _hash,
            coalesce(_acks, '{}'::jsonb), coalesce(_listened, false)) returning id into _id;
  begin
    insert into public.activity_log (user_id, action, target_type, target_id, metadata)
      values (_user, 'terms_reaccepted', 'booking', _booking::text, jsonb_build_object('version', _tv.version, 'hash', _hash));
    perform public.notify_user(_b.landlord_id, 'booking_terms_accepted', 'Tenant accepted updated terms',
      coalesce(_b.tenant_name, 'A tenant') || ' accepted your updated rental terms (v' || _tv.version || ').', '/bookings');
  exception when others then null; end;
  return jsonb_build_object('id', _id, 'terms_version', _tv.version, 'hash', _hash);
end $$;

do $$
declare f text;
begin
  foreach f in array array['terms_reaccept_status(uuid)', 'record_terms_reacceptance(uuid,uuid,jsonb,boolean)'] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
