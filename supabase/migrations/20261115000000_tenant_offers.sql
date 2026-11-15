-- Tenant rent OFFERS (negotiation) on booking requests.
--
-- Design rules (see docs): the landlord's floor lives in a PRIVATE table (rooms is publicly readable, so it
-- must never be a column there); all state changes go through SECURITY DEFINER functions that only the
-- service role can execute; direct writes to the offer columns by tenants/landlords are blocked by a trigger.

-- ---------------------------------------------------------------- private per-room settings
create table if not exists public.room_offer_settings (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  owner_id uuid not null,
  offers_enabled boolean not null default false,
  min_rent numeric check (min_rent is null or min_rent >= 0), -- the floor; NEVER shown to tenants
  auto_approve boolean not null default false,               -- auto-approve the PRICE when offer >= floor
  updated_at timestamptz not null default now()
);
alter table public.room_offer_settings enable row level security;
grant select, insert, update, delete on public.room_offer_settings to authenticated;
grant all on public.room_offer_settings to service_role;

drop policy if exists "offer settings owner read" on public.room_offer_settings;
create policy "offer settings owner read" on public.room_offer_settings
  for select to authenticated using (owner_id = auth.uid());
drop policy if exists "offer settings owner write" on public.room_offer_settings;
create policy "offer settings owner write" on public.room_offer_settings
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid() and exists (select 1 from public.rooms r where r.id = room_id and r.owner_id = auth.uid()));

-- ---------------------------------------------------------------- offer columns on bookings
alter table public.bookings
  add column if not exists offer_status text,
  add column if not exists offered_rent numeric,
  add column if not exists counter_rent numeric,
  add column if not exists agreed_rent numeric,
  add column if not exists offer_expires_at timestamptz,
  add column if not exists offer_rounds int not null default 0;

do $$ begin
  alter table public.bookings add constraint bookings_offer_status_chk
    check (offer_status is null or offer_status in ('pending','countered','approved','declined','expired','withdrawn'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.bookings add constraint bookings_offer_amounts_chk
    check ((offered_rent is null or offered_rent > 0) and (counter_rent is null or counter_rent > 0) and (agreed_rent is null or agreed_rent > 0));
exception when duplicate_object then null; end $$;

create index if not exists idx_bookings_offer_open on public.bookings (offer_status, offer_expires_at)
  where offer_status in ('pending','countered');
create index if not exists idx_bookings_offer_attempts on public.bookings (tenant_user_id, room_id, created_at)
  where offered_rent is not null;

-- ---------------------------------------------------------------- guard trigger
-- Untrusted callers (PostgREST roles authenticated/anon) can never write the offer columns, and a tenant can
-- only cancel their own pending request. Server-side (service role) code is trusted.
create or replace function public.bookings_offer_guard() returns trigger
language plpgsql as $$
declare
  _untrusted boolean := current_user in ('authenticated', 'anon');
begin
  if tg_op = 'INSERT' then
    if _untrusted then
      new.offer_status := null; new.offered_rent := null; new.counter_rent := null;
      new.agreed_rent := null; new.offer_expires_at := null; new.offer_rounds := 0;
    end if;
    return new;
  end if;

  if _untrusted then
    if new.offer_status is distinct from old.offer_status
       or new.offered_rent is distinct from old.offered_rent
       or new.counter_rent is distinct from old.counter_rent
       or new.agreed_rent is distinct from old.agreed_rent
       or new.offer_expires_at is distinct from old.offer_expires_at
       or new.offer_rounds is distinct from old.offer_rounds then
      raise exception 'OFFER_FIELDS_LOCKED: offer fields can only be changed through the offer actions';
    end if;
    -- a tenant (who is not also the landlord) may only cancel their own pending request
    if auth.uid() is not null and auth.uid() = old.tenant_user_id and auth.uid() is distinct from old.landlord_id then
      if new.status is distinct from old.status and not (old.status = 'pending' and new.status = 'cancelled') then
        raise exception 'BOOKING_STATUS_LOCKED: a tenant can only cancel a pending request';
      end if;
      if new.landlord_id is distinct from old.landlord_id or new.room_id is distinct from old.room_id
         or new.tenant_user_id is distinct from old.tenant_user_id or new.tenant_id is distinct from old.tenant_id
         or new.decided_at is distinct from old.decided_at then
        raise exception 'BOOKING_STATUS_LOCKED: protected booking fields';
      end if;
    end if;
  end if;

  -- Accepting a booking while an offer is still open would silently ignore the tenant's offer.
  if new.status = 'accepted' and old.status is distinct from 'accepted' and new.offer_status in ('pending','countered') then
    raise exception 'OFFER_OPEN: decide the rent offer (approve, deny or counter) before accepting this request';
  end if;

  -- request closed => offer closed
  if new.status in ('rejected','cancelled') and old.status = 'pending' and new.offer_status in ('pending','countered') then
    new.offer_status := case when new.status = 'rejected' then 'declined' else 'withdrawn' end;
    new.offer_expires_at := null;
  end if;
  return new;
end $$;

drop trigger if exists bookings_offer_guard_trg on public.bookings;
create trigger bookings_offer_guard_trg before insert or update on public.bookings
  for each row execute function public.bookings_offer_guard();

-- ---------------------------------------------------------------- actions (service role only)
create or replace function public.offer_submit(_booking uuid, _tenant uuid, _offered numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b public.bookings; _rent numeric; s public.room_offer_settings; _tries int; _rn text; _tname text;
begin
  select * into b from public.bookings where id = _booking for update;
  if not found or b.tenant_user_id <> _tenant then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'pending' or b.offer_status is not null then raise exception 'OFFER_INVALID_STATE'; end if;
  select rent_amount, room_number into _rent, _rn from public.rooms where id = b.room_id;
  select * into s from public.room_offer_settings where room_id = b.room_id;
  if s.room_id is null or not s.offers_enabled then raise exception 'OFFERS_OFF: this room is not taking offers'; end if;
  if _offered is null or _offered <= 0 or _rent is null or _rent <= 0 then raise exception 'OFFER_INVALID'; end if;
  if _offered >= _rent then raise exception 'OFFER_NOT_LOWER: the offer must be lower than the listed rent'; end if;
  if _offered < ceil(_rent * 0.5) then raise exception 'OFFER_TOO_LOW: offers below 50%% of the rent are not accepted'; end if;
  select count(*) into _tries from public.bookings
   where tenant_user_id = _tenant and room_id = b.room_id and offered_rent is not null
     and created_at > now() - interval '7 days';
  if _tries >= 2 then raise exception 'OFFER_LIMIT: you can send at most 2 offers per room in 7 days'; end if;

  _offered := round(_offered);
  _tname := b.tenant_name;
  if s.auto_approve and s.min_rent is not null and _offered >= s.min_rent then
    update public.bookings set offer_status = 'approved', offered_rent = _offered, agreed_rent = _offered where id = _booking;
    perform public.notify_user(b.landlord_id, 'booking_offer_new', 'Offer auto-approved: Rs ' || _offered::bigint,
      _tname || ' offered Rs ' || _offered::bigint || ' for room ' || coalesce(_rn, '') || ' (listed Rs ' || _rent::bigint || '). The price was auto-approved; accept the request to confirm.', '/bookings');
    return jsonb_build_object('offer_status', 'approved');
  end if;
  update public.bookings set offer_status = 'pending', offered_rent = _offered where id = _booking;
  perform public.notify_user(b.landlord_id, 'booking_offer_new', 'New rent offer: Rs ' || _offered::bigint,
    _tname || ' offered Rs ' || _offered::bigint || ' for room ' || coalesce(_rn, '') || ' (listed Rs ' || _rent::bigint || '). Approve, deny or counter.', '/bookings');
  return jsonb_build_object('offer_status', 'pending');
end $$;

create or replace function public.offer_decide(_booking uuid, _landlord uuid, _action text, _counter numeric default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings; _rent numeric; _rn text;
begin
  select * into b from public.bookings where id = _booking for update;
  if not found or b.landlord_id <> _landlord then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'pending' or b.offer_status <> 'pending' then raise exception 'OFFER_INVALID_STATE: no open offer to decide'; end if;
  select rent_amount, room_number into _rent, _rn from public.rooms where id = b.room_id;

  if _action = 'approve' then
    update public.bookings set offer_status = 'approved', agreed_rent = b.offered_rent, offer_expires_at = null where id = _booking;
    perform public.notify_user(b.tenant_user_id, 'booking_offer_approved', 'Your offer was approved',
      'The landlord approved Rs ' || b.offered_rent::bigint || ' for room ' || coalesce(_rn, '') || '. Your booking will be confirmed shortly.', '/myr/bookings');
    return jsonb_build_object('offer_status', 'approved', 'agreed_rent', b.offered_rent);
  elsif _action = 'deny' then
    update public.bookings set status = 'rejected', decided_at = now() where id = _booking; -- trigger sets offer_status = declined
    perform public.notify_user(b.tenant_user_id, 'booking_offer_declined', 'Offer not accepted',
      'The landlord did not accept this offer for room ' || coalesce(_rn, '') || '. You can send a new request.', '/myr/bookings');
    return jsonb_build_object('offer_status', 'declined');
  elsif _action = 'counter' then
    if _counter is null or _counter <= b.offered_rent or _counter > _rent then
      raise exception 'COUNTER_INVALID: the counter must be above the offer and not above the listed rent';
    end if;
    if b.offer_rounds >= 1 then raise exception 'COUNTER_LIMIT: only one counter offer is allowed'; end if;
    _counter := round(_counter);
    update public.bookings set offer_status = 'countered', counter_rent = _counter, offer_rounds = offer_rounds + 1,
      offer_expires_at = now() + interval '24 hours' where id = _booking;
    perform public.notify_user(b.tenant_user_id, 'booking_offer_counter', 'Counter offer: Rs ' || _counter::bigint,
      'The landlord countered with Rs ' || _counter::bigint || ' for room ' || coalesce(_rn, '') || '. Reply within 24 hours.', '/myr/bookings');
    return jsonb_build_object('offer_status', 'countered', 'counter_rent', _counter);
  end if;
  raise exception 'OFFER_INVALID_ACTION';
end $$;

create or replace function public.offer_respond(_booking uuid, _tenant uuid, _action text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.bookings; _rn text;
begin
  select * into b from public.bookings where id = _booking for update;
  if not found or b.tenant_user_id <> _tenant then raise exception 'FORBIDDEN'; end if;
  if b.status <> 'pending' or b.offer_status <> 'countered' then raise exception 'OFFER_INVALID_STATE: no counter offer to answer'; end if;
  if b.offer_expires_at is not null and b.offer_expires_at < now() then
    -- do NOT raise: that would roll the expiry back. Close it and report.
    perform public.expire_booking_offers();
    return jsonb_build_object('offer_status', 'expired');
  end if;
  select room_number into _rn from public.rooms where id = b.room_id;

  if _action = 'accept' then
    update public.bookings set offer_status = 'approved', agreed_rent = b.counter_rent, offer_expires_at = null where id = _booking;
    perform public.notify_user(b.landlord_id, 'booking_offer_counter_accepted', 'Tenant accepted your counter',
      b.tenant_name || ' accepted Rs ' || b.counter_rent::bigint || ' for room ' || coalesce(_rn, '') || '. Accept the request to confirm.', '/bookings');
    return jsonb_build_object('offer_status', 'approved', 'agreed_rent', b.counter_rent);
  elsif _action = 'decline' then
    update public.bookings set status = 'cancelled' where id = _booking; -- trigger sets offer_status = withdrawn
    update public.bookings set offer_status = 'declined' where id = _booking;
    perform public.notify_user(b.landlord_id, 'booking_offer_counter_declined', 'Tenant declined your counter',
      b.tenant_name || ' did not accept Rs ' || b.counter_rent::bigint || ' for room ' || coalesce(_rn, '') || '.', '/bookings');
    return jsonb_build_object('offer_status', 'declined');
  end if;
  raise exception 'OFFER_INVALID_ACTION';
end $$;

-- Rent to use when a request is accepted: the agreed rent, or NULL (= normal listed rent). Raises if an offer is still open.
create or replace function public.offer_agreed_rent(_booking uuid) returns numeric
language plpgsql security definer stable set search_path = public as $$
declare b public.bookings;
begin
  select * into b from public.bookings where id = _booking;
  if not found then return null; end if;
  if b.offer_status in ('pending','countered') then
    raise exception 'OFFER_OPEN: decide the rent offer (approve, deny or counter) before accepting this request';
  end if;
  if b.offer_status = 'approved' then return b.agreed_rent; end if;
  return null;
end $$;

-- Expire unanswered counters (also called lazily by the app, so this works even if cron is not running).
create or replace function public.expire_booking_offers() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select id, landlord_id, tenant_user_id from public.bookings
            where status = 'pending' and offer_status = 'countered' and offer_expires_at < now() for update skip locked
  loop
    update public.bookings set status = 'cancelled' where id = r.id;
    update public.bookings set offer_status = 'expired' where id = r.id;
    perform public.notify_user(r.tenant_user_id, 'booking_offer_expired', 'Counter offer expired', 'You did not reply in time, so the request was closed.', '/myr/bookings');
    perform public.notify_user(r.landlord_id, 'booking_offer_expired', 'Counter offer expired', 'The tenant did not reply to your counter offer, so the request was closed.', '/bookings');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.offer_submit(uuid, uuid, numeric) from public, anon, authenticated;
revoke all on function public.offer_decide(uuid, uuid, text, numeric) from public, anon, authenticated;
revoke all on function public.offer_respond(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.offer_agreed_rent(uuid) from public, anon, authenticated;
revoke all on function public.expire_booking_offers() from public, anon, authenticated;
grant execute on function public.offer_submit(uuid, uuid, numeric) to service_role;
grant execute on function public.offer_decide(uuid, uuid, text, numeric) to service_role;
grant execute on function public.offer_respond(uuid, uuid, text) to service_role;
grant execute on function public.offer_agreed_rent(uuid) to service_role;
grant execute on function public.expire_booking_offers() to service_role;

do $$ begin perform cron.unschedule('booking-offers-expiry'); exception when others then null; end $$;
do $$ begin perform cron.schedule('booking-offers-expiry', '*/30 * * * *', 'select public.expire_booking_offers()'); exception when others then null; end $$;
