-- =====================================================================
-- Rentalos subscription + entitlement + manual-QR-payment system.
-- Requires: 20260920000000_verification_decide_fix.sql (is_trusted_db_session)
--
-- Exactly three products (enforced by a CHECK on subscription_plans.code):
--   FREE (₹0) · RENTDESK (₹69/mo) · RENTALOS_MANAGEMENT (₹169/mo)
-- Access is decided ONLY by entitlements:
--   explicit override -> active plan entitlement -> FREE entitlement -> disabled
-- No payment gateway. Users submit proof; an admin approves; only then
-- does a paid plan activate. All state changes happen in SECURITY DEFINER
-- functions callable by service_role only (never by browser clients).
-- =====================================================================

-- ---------- catalog / plans ----------
create table if not exists public.subscription_plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code in ('FREE','RENTDESK','RENTALOS_MANAGEMENT')),
  name text not null,
  price_inr numeric(10,2) not null default 0 check (price_inr >= 0),
  billing_months int not null default 1 check (billing_months in (1,3,6,12)),
  description text,
  active boolean not null default true,          -- can be purchased
  public_visible boolean not null default true,  -- shown on pricing page
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.feature_catalog (
  feature_key text primary key,
  label text not null,
  description text,
  kind text not null default 'feature' check (kind in ('feature','limit')),
  sort_order int not null default 0,
  visible boolean not null default true
);

create table if not exists public.plan_entitlements (
  plan_id uuid not null references public.subscription_plans(id) on delete cascade,
  feature_key text not null references public.feature_catalog(feature_key) on delete cascade,
  enabled boolean not null default false,
  limit_value int check (limit_value is null or limit_value >= 0), -- null = unlimited (limits only)
  created_at timestamptz not null default now(),
  primary key (plan_id, feature_key)
);

-- ---------- per-user state ----------
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  plan_id uuid not null references public.subscription_plans(id),
  status text not null default 'FREE' check (status in ('FREE','PENDING','ACTIVE','EXPIRED','SUSPENDED','CANCELLED')),
  starts_at timestamptz,
  expires_at timestamptz,
  payment_status text,
  source text not null default 'payment' check (source in ('payment','admin_grant','legacy_grandfather','legacy_migration')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscription_discounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  plan_id uuid not null references public.subscription_plans(id),
  kind text not null check (kind in ('fixed','percent','free')),
  value numeric(10,2),
  duration_months int not null default 1 check (duration_months >= 1),
  periods_used int not null default 0,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  active boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'free' and value is null) or (kind = 'percent' and value between 0 and 100) or (kind = 'fixed' and value >= 0))
);
create index if not exists idx_sub_discounts_user on public.subscription_discounts (user_id, plan_id);

create table if not exists public.subscription_payments (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references public.user_subscriptions(id) on delete set null,
  user_id uuid not null,
  plan_id uuid not null references public.subscription_plans(id),
  amount numeric(10,2) not null check (amount >= 0),            -- server-computed payable
  original_amount numeric(10,2) not null,
  discount_amount numeric(10,2) not null default 0,
  discount_id uuid references public.subscription_discounts(id) on delete set null,
  claimed_amount numeric(10,2),                                   -- what the user says they paid
  payment_method text not null default 'upi_qr',
  transaction_reference text,
  payment_proof_path text,
  note text,
  status text not null default 'PENDING_REVIEW' check (status in ('DRAFT','PENDING_REVIEW','APPROVED','REJECTED','CANCELLED')),
  clarification_requested boolean not null default false,
  admin_note text,
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid,
  created_at timestamptz not null default now()
);
create unique index if not exists uq_sub_payment_one_pending
  on public.subscription_payments (user_id, plan_id) where status = 'PENDING_REVIEW';
create unique index if not exists uq_sub_payment_txn
  on public.subscription_payments (lower(transaction_reference))
  where transaction_reference is not null and status in ('PENDING_REVIEW','APPROVED');
create index if not exists idx_sub_payments_status on public.subscription_payments (status, submitted_at desc);

create table if not exists public.entitlement_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  feature_key text not null references public.feature_catalog(feature_key) on delete cascade,
  enabled boolean not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  reason text,
  created_by uuid,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_ent_overrides_user on public.entitlement_overrides (user_id, feature_key);

create table if not exists public.subscription_settings (
  id int primary key default 1 check (id = 1),
  grace_days int not null default 0 check (grace_days between 0 and 30),
  upi_id text,
  payee_name text,
  instructions text,
  qr_path text,
  legacy_grandfather_done boolean not null default false,
  updated_by uuid,
  updated_at timestamptz not null default now()
);
insert into public.subscription_settings (id) values (1) on conflict (id) do nothing;

-- ---------- RLS: users can READ their own state; they can NEVER write ----------
alter table public.subscription_plans enable row level security;
alter table public.feature_catalog enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.subscription_discounts enable row level security;
alter table public.subscription_payments enable row level security;
alter table public.entitlement_overrides enable row level security;
alter table public.subscription_settings enable row level security;

drop policy if exists "plans public read" on public.subscription_plans;
create policy "plans public read" on public.subscription_plans for select to anon, authenticated using (public_visible);
drop policy if exists "catalog public read" on public.feature_catalog;
create policy "catalog public read" on public.feature_catalog for select to anon, authenticated using (visible);
drop policy if exists "plan ent public read" on public.plan_entitlements;
create policy "plan ent public read" on public.plan_entitlements for select to anon, authenticated using (true);

drop policy if exists "own subscription read" on public.user_subscriptions;
create policy "own subscription read" on public.user_subscriptions for select to authenticated using (auth.uid() = user_id or is_admin(auth.uid()));
drop policy if exists "own payments read" on public.subscription_payments;
create policy "own payments read" on public.subscription_payments for select to authenticated using (auth.uid() = user_id or is_admin(auth.uid()));
drop policy if exists "admin discounts read" on public.subscription_discounts;
create policy "admin discounts read" on public.subscription_discounts for select to authenticated using (is_admin(auth.uid()));
drop policy if exists "admin overrides read" on public.entitlement_overrides;
create policy "admin overrides read" on public.entitlement_overrides for select to authenticated using (is_admin(auth.uid()));
drop policy if exists "admin settings read" on public.subscription_settings;
create policy "admin settings read" on public.subscription_settings for select to authenticated using (is_admin(auth.uid()));

grant select on public.subscription_plans, public.feature_catalog, public.plan_entitlements to anon;
grant select on public.subscription_plans, public.feature_catalog, public.plan_entitlements,
  public.user_subscriptions, public.subscription_payments, public.subscription_discounts,
  public.entitlement_overrides, public.subscription_settings to authenticated;
grant all on public.subscription_plans, public.feature_catalog, public.plan_entitlements,
  public.user_subscriptions, public.subscription_payments, public.subscription_discounts,
  public.entitlement_overrides, public.subscription_settings to service_role;

-- ---------- seed: three products ----------
insert into public.subscription_plans (code, name, price_inr, description, sort_order) values
  ('FREE', 'Free', 0, 'Find a room, list a property and get booking requests.', 1),
  ('RENTDESK', 'RentDesk', 69, 'Run your rentals: tenants, bills, meters, maintenance and rent reminders.', 2),
  ('RENTALOS_MANAGEMENT', 'Rentalos Management', 169, 'Everything in RentDesk plus unlimited properties, advanced analytics and automation.', 3)
on conflict (code) do nothing;

insert into public.feature_catalog (feature_key, label, description, kind, sort_order) values
  ('marketplace_browse', 'Browse the Rentalos marketplace', null, 'feature', 10),
  ('basic_search', 'Search and filters', null, 'feature', 20),
  ('roommate_match', 'Roommate matching', null, 'feature', 30),
  ('tenant_portal', 'Tenant portal: bills, payment proof, maintenance requests', null, 'feature', 40),
  ('landlord_basic', 'List properties and receive booking requests', null, 'feature', 50),
  ('rentdesk_core', 'RentDesk: tenants, bills, deposits, maintenance, move-in/out', null, 'feature', 60),
  ('payment_verification', 'Verify tenant rent payments', null, 'feature', 70),
  ('ai_meter_ocr', 'Meter photo reading', null, 'feature', 80),
  ('live_feed_video', 'Live-verified video on listings', null, 'feature', 90),
  ('document_storage', 'Document storage', null, 'feature', 100),
  ('rent_reminders', 'Rent reminders (in-app and WhatsApp)', null, 'feature', 110),
  ('basic_analytics', 'Dashboard statistics', null, 'feature', 120),
  ('advanced_analytics', 'Advanced room analytics', null, 'feature', 130),
  ('advanced_automation', 'Advanced automation: lease alerts and WhatsApp assistant', null, 'feature', 140),
  ('partner_import', 'Bulk property import for societies and managers', null, 'feature', 150),
  ('max_properties', 'Properties', null, 'limit', 160),
  ('max_rooms', 'Rooms', null, 'limit', 170)
on conflict (feature_key) do nothing;

-- Entitlement matrix (admin-editable afterwards).
insert into public.plan_entitlements (plan_id, feature_key, enabled, limit_value)
select p.id, f.feature_key,
  case
    when f.kind = 'limit' then true
    when f.feature_key in ('marketplace_browse','basic_search','roommate_match','tenant_portal','landlord_basic') then true
    when f.feature_key in ('rentdesk_core','payment_verification','ai_meter_ocr','live_feed_video','document_storage','rent_reminders','basic_analytics')
      then p.code in ('RENTDESK','RENTALOS_MANAGEMENT')
    when f.feature_key in ('advanced_analytics','advanced_automation','partner_import') then p.code = 'RENTALOS_MANAGEMENT'
    else false end,
  case
    when f.feature_key = 'max_properties' then case p.code when 'FREE' then 1 when 'RENTDESK' then 10 else null end
    when f.feature_key = 'max_rooms' then case p.code when 'FREE' then 10 when 'RENTDESK' then 100 else null end
    else null end
from public.subscription_plans p cross join public.feature_catalog f
on conflict (plan_id, feature_key) do nothing;

-- ---------- audit helper (immutable log) ----------
create or replace function public.sub_audit(_admin uuid, _target uuid, _action text, _prev jsonb, _new jsonb, _reason text)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  insert into public.admin_audit_logs (admin_user_id, action, target_type, target_id, metadata)
  values (coalesce(_admin, '00000000-0000-0000-0000-000000000000'::uuid), _action, 'user', _target::text,
          jsonb_build_object('target_user_id', _target, 'previous_state', _prev, 'new_state', _new, 'reason', _reason));
end $$;

-- Audit rows can never be edited or deleted (even by the service role).
create or replace function public.audit_log_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'Audit log entries are immutable.';
end $$;
drop trigger if exists trg_audit_immutable on public.admin_audit_logs;
create trigger trg_audit_immutable before update or delete on public.admin_audit_logs
  for each row execute function public.audit_log_immutable();

-- ---------- entitlement resolution ----------
create or replace function public.sub_grace_days() returns int language sql stable security definer set search_path to 'public' as $$
  select coalesce((select grace_days from public.subscription_settings where id = 1), 0);
$$;

-- Plan in force RIGHT NOW. Expiry is evaluated here (lazily), so access is
-- correct even if the expiry cron has not run yet.
create or replace function public.sub_effective_plan_code(_uid uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select coalesce((
    select p.code
      from public.user_subscriptions s
      join public.subscription_plans p on p.id = s.plan_id
     where s.user_id = _uid
       and s.status = 'ACTIVE'
       and (s.starts_at is null or s.starts_at <= now())
       and (s.expires_at is null or s.expires_at + make_interval(days => public.sub_grace_days()) > now())
  ), 'FREE');
$$;

create or replace function public.has_entitlement(_uid uuid, _key text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare _o boolean; _e boolean;
begin
  -- 1) explicit, currently-valid admin override (latest wins, deterministic)
  select o.enabled into _o
    from public.entitlement_overrides o
   where o.user_id = _uid and o.feature_key = _key and o.revoked_at is null
     and o.starts_at <= now() and (o.expires_at is null or o.expires_at > now())
   order by o.created_at desc, o.id desc limit 1;
  if _o is not null then return _o; end if;
  -- 2) entitlement of the plan in force
  select e.enabled into _e from public.plan_entitlements e join public.subscription_plans p on p.id = e.plan_id
   where p.code = public.sub_effective_plan_code(_uid) and e.feature_key = _key;
  if _e is not null then return _e; end if;
  -- 3) FREE default, 4) disabled
  select e.enabled into _e from public.plan_entitlements e join public.subscription_plans p on p.id = e.plan_id
   where p.code = 'FREE' and e.feature_key = _key;
  return coalesce(_e, false);
end $$;

-- Numeric limit (null = unlimited).
create or replace function public.entitlement_limit(_uid uuid, _key text) returns int
language plpgsql stable security definer set search_path to 'public' as $$
declare _l int; _f boolean := false;
begin
  select e.limit_value, true into _l, _f from public.plan_entitlements e join public.subscription_plans p on p.id = e.plan_id
   where p.code = public.sub_effective_plan_code(_uid) and e.feature_key = _key;
  if _f then return _l; end if;
  select e.limit_value, true into _l, _f from public.plan_entitlements e join public.subscription_plans p on p.id = e.plan_id
   where p.code = 'FREE' and e.feature_key = _key;
  if _f then return _l; end if;
  return 0;
end $$;

create or replace function public.get_effective_entitlements(_uid uuid) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare _feat jsonb := '{}'::jsonb; _lim jsonb := '{}'::jsonb; r record; _sub record; _status text;
begin
  for r in select feature_key, kind from public.feature_catalog loop
    if r.kind = 'feature' then _feat := _feat || jsonb_build_object(r.feature_key, public.has_entitlement(_uid, r.feature_key));
    else _lim := _lim || jsonb_build_object(r.feature_key, public.entitlement_limit(_uid, r.feature_key)); end if;
  end loop;
  select s.status, s.expires_at, s.starts_at, s.source into _sub from public.user_subscriptions s where s.user_id = _uid;
  _status := coalesce(_sub.status, 'FREE');
  if _status = 'ACTIVE' and public.sub_effective_plan_code(_uid) = 'FREE' then _status := 'EXPIRED'; end if;
  return jsonb_build_object(
    'plan_code', public.sub_effective_plan_code(_uid),
    'status', _status,
    'starts_at', _sub.starts_at, 'expires_at', _sub.expires_at, 'source', _sub.source,
    'features', _feat, 'limits', _lim,
    'has_rentdesk_data', exists (select 1 from public.tenants t where t.owner_id = _uid)
                         or exists (select 1 from public.bills b where b.owner_id = _uid));
end $$;

-- ---------- price computation (server-side, never from the client) ----------
create or replace function public.compute_payable(_uid uuid, _plan_code text) returns jsonb
language plpgsql stable security definer set search_path to 'public' as $$
declare _plan record; _best record; _disc numeric := 0; _d numeric; _win uuid;
begin
  select * into _plan from public.subscription_plans where code = _plan_code;
  if not found then raise exception 'Unknown plan'; end if;
  for _best in
    select d.* from public.subscription_discounts d
     where d.user_id = _uid and d.plan_id = _plan.id and d.active
       and d.starts_at <= now() and (d.expires_at is null or d.expires_at > now())
       and d.periods_used < d.duration_months
     order by d.created_at asc
  loop
    _d := case _best.kind when 'free' then _plan.price_inr
                          when 'percent' then round(_plan.price_inr * _best.value / 100, 2)
                          else least(_best.value, _plan.price_inr) end;
    if _d > _disc then _disc := _d; _win := _best.id; end if;
  end loop;
  return jsonb_build_object('plan_id', _plan.id, 'original', _plan.price_inr, 'discount', _disc,
    'payable', greatest(_plan.price_inr - _disc, 0), 'discount_id', _win);
end $$;

-- ---------- user submits payment proof (server fn, service role) ----------
create or replace function public.submit_subscription_payment(
  _uid uuid, _plan_code text, _txn text, _claimed numeric, _proof text, _note text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _pay jsonb; _plan record; _id uuid; _sub record; _payable numeric;
begin
  select * into _plan from public.subscription_plans where code = _plan_code;
  if not found or _plan.code = 'FREE' or not _plan.active then raise exception 'This plan cannot be purchased.'; end if;
  _pay := public.compute_payable(_uid, _plan_code);
  _payable := (_pay->>'payable')::numeric;
  if _payable > 0 then
    if coalesce(length(trim(_txn)), 0) < 4 then raise exception 'Enter the transaction / reference ID.'; end if;
    if _proof is null or _proof not like _uid::text || '/%' then raise exception 'Upload your payment screenshot.'; end if;
  end if;
  if exists (select 1 from public.subscription_payments where user_id = _uid and plan_id = _plan.id and status = 'PENDING_REVIEW') then
    raise exception 'You already have a payment for this plan waiting for review.';
  end if;

  select * into _sub from public.user_subscriptions where user_id = _uid;
  if not found then
    insert into public.user_subscriptions (user_id, plan_id, status, source, payment_status)
      values (_uid, _plan.id, 'PENDING', 'payment', 'PENDING_REVIEW') returning * into _sub;
  elsif _sub.status in ('FREE','EXPIRED','CANCELLED') then
    update public.user_subscriptions set plan_id = _plan.id, status = 'PENDING', payment_status = 'PENDING_REVIEW', updated_at = now()
     where id = _sub.id returning * into _sub;
  end if;

  insert into public.subscription_payments (subscription_id, user_id, plan_id, amount, original_amount, discount_amount,
      discount_id, claimed_amount, transaction_reference, payment_proof_path, note, status)
    values (_sub.id, _uid, _plan.id, _payable, (_pay->>'original')::numeric, (_pay->>'discount')::numeric,
      nullif(_pay->>'discount_id','')::uuid, _claimed, nullif(trim(_txn), ''), _proof, _note, 'PENDING_REVIEW')
    returning id into _id;
  return jsonb_build_object('payment_id', _id, 'payable', _payable, 'status', 'PENDING_REVIEW');
end $$;

-- ---------- admin decides a payment (atomic) ----------
create or replace function public.decide_subscription_payment(_admin uuid, _payment uuid, _decision text, _note text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _p record; _plan record; _sub record; _base timestamptz; _exp timestamptz; _prev jsonb; _new jsonb; _title text;
begin
  select * into _p from public.subscription_payments where id = _payment for update;
  if not found then raise exception 'Payment not found.'; end if;
  if _p.status <> 'PENDING_REVIEW' then raise exception 'This payment was already decided (%).', _p.status; end if;
  if _decision not in ('APPROVED','REJECTED','CLARIFICATION') then raise exception 'Invalid decision.'; end if;
  if _decision in ('REJECTED','CLARIFICATION') and coalesce(length(trim(_note)), 0) = 0 then
    raise exception 'Add a note so the user knows what to fix.';
  end if;
  select * into _plan from public.subscription_plans where id = _p.plan_id;
  select * into _sub from public.user_subscriptions where user_id = _p.user_id;
  _prev := jsonb_build_object('payment_status', _p.status, 'subscription_status', _sub.status, 'plan_id', _sub.plan_id, 'expires_at', _sub.expires_at);

  if _decision = 'CLARIFICATION' then
    update public.subscription_payments set clarification_requested = true, admin_note = _note where id = _payment;
    perform public.notify_user(_p.user_id, 'subscription_payment_clarification', 'More details needed', _note, '/subscription');
    perform public.sub_audit(_admin, _p.user_id, 'payment_clarification_requested', _prev, _prev, _note);
    return jsonb_build_object('status', 'PENDING_REVIEW', 'clarification', true);
  end if;

  if _decision = 'REJECTED' then
    update public.subscription_payments set status = 'REJECTED', reviewed_at = now(), reviewed_by = _admin, admin_note = _note where id = _payment;
    -- A rejected payment never activates anything: PENDING falls back to FREE.
    if _sub.status = 'PENDING' and not exists (
         select 1 from public.subscription_payments where user_id = _p.user_id and status = 'PENDING_REVIEW' and id <> _payment) then
      update public.user_subscriptions set status = 'FREE', plan_id = (select id from public.subscription_plans where code = 'FREE'),
             payment_status = 'REJECTED', updated_at = now() where id = _sub.id;
    end if;
    perform public.notify_user(_p.user_id, 'subscription_payment_rejected', 'Payment not approved', _note, '/subscription');
    perform public.sub_audit(_admin, _p.user_id, 'payment_rejected', _prev, jsonb_build_object('payment_status', 'REJECTED'), _note);
    return jsonb_build_object('status', 'REJECTED');
  end if;

  -- APPROVED: activate. Same plan still running -> extend from its expiry; otherwise start now.
  if _sub.status = 'ACTIVE' and _sub.plan_id = _p.plan_id and _sub.expires_at is not null and _sub.expires_at > now() then
    _base := _sub.expires_at;
  else
    _base := now();
  end if;
  _exp := _base + make_interval(months => _plan.billing_months);
  update public.user_subscriptions
     set plan_id = _p.plan_id, status = 'ACTIVE',
         starts_at = case when _base = now() then now() else coalesce(starts_at, now()) end,
         expires_at = _exp, payment_status = 'APPROVED', source = 'payment', updated_at = now()
   where id = _sub.id returning * into _sub;
  update public.subscription_payments set status = 'APPROVED', reviewed_at = now(), reviewed_by = _admin, admin_note = _note,
         subscription_id = _sub.id where id = _payment;
  if _p.discount_id is not null then
    update public.subscription_discounts set periods_used = periods_used + 1, updated_at = now() where id = _p.discount_id;
  end if;
  _new := jsonb_build_object('payment_status', 'APPROVED', 'subscription_status', 'ACTIVE', 'plan_id', _p.plan_id, 'expires_at', _exp);
  perform public.notify_user(_p.user_id, 'subscription_payment_approved', 'Payment approved', _plan.name || ' is active until ' || to_char(_exp, 'DD Mon YYYY') || '.', '/subscription');
  perform public.notify_user(_p.user_id, 'subscription_activated', _plan.name || ' activated', 'Your plan is now active.', '/subscription');
  perform public.sub_audit(_admin, _p.user_id, 'payment_approved', _prev, _new, _note);
  return jsonb_build_object('status', 'APPROVED', 'expires_at', _exp);
end $$;

-- ---------- admin plan actions ----------
create or replace function public.admin_apply_subscription_action(
  _admin uuid, _target uuid, _action text, _plan_code text, _months int, _reason text) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _sub record; _plan record; _prev jsonb; _new jsonb; _exp timestamptz; _name text; _audit text;
begin
  if coalesce(length(trim(_reason)), 0) = 0 then raise exception 'A reason is required.'; end if;
  if _action not in ('assign','extend','reduce','cancel','suspend','reactivate') then raise exception 'Unknown action.'; end if;
  select * into _sub from public.user_subscriptions where user_id = _target;
  _prev := case when found then jsonb_build_object('status', _sub.status, 'plan_id', _sub.plan_id, 'expires_at', _sub.expires_at, 'source', _sub.source) else '{}'::jsonb end;

  if _action = 'assign' then
    select * into _plan from public.subscription_plans where code = _plan_code;
    if not found then raise exception 'Unknown plan.'; end if;
    if _plan.code = 'FREE' then
      insert into public.user_subscriptions (user_id, plan_id, status, starts_at, expires_at, source)
        values (_target, _plan.id, 'FREE', now(), null, 'admin_grant')
      on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'FREE', starts_at = now(), expires_at = null,
        source = 'admin_grant', payment_status = null, updated_at = now();
      _audit := 'free_access_granted';
    else
      _exp := case when _months is null then null else now() + make_interval(months => _months) end; -- null = until revoked
      insert into public.user_subscriptions (user_id, plan_id, status, starts_at, expires_at, source)
        values (_target, _plan.id, 'ACTIVE', now(), _exp, 'admin_grant')
      on conflict (user_id) do update set plan_id = excluded.plan_id, status = 'ACTIVE', starts_at = now(), expires_at = _exp,
        source = 'admin_grant', payment_status = null, updated_at = now();
      _audit := 'subscription_assigned';
    end if;
  else
    if not found then raise exception 'This user has no subscription record. Assign a plan first.'; end if;
    if _action = 'extend' then
      if coalesce(_months, 0) <= 0 then raise exception 'Months must be positive.'; end if;
      _exp := greatest(coalesce(_sub.expires_at, now()), now()) + make_interval(months => _months);
      update public.user_subscriptions set expires_at = _exp, status = case when status in ('EXPIRED') then 'ACTIVE' else status end, updated_at = now() where id = _sub.id;
      _audit := 'subscription_extended';
    elsif _action = 'reduce' then
      if coalesce(_months, 0) <= 0 then raise exception 'Months must be positive.'; end if;
      if _sub.expires_at is null then raise exception 'This subscription has no expiry to reduce.'; end if;
      _exp := _sub.expires_at - make_interval(months => _months);
      update public.user_subscriptions set expires_at = _exp, status = case when _exp <= now() then 'EXPIRED' else status end, updated_at = now() where id = _sub.id;
      _audit := 'subscription_reduced';
    elsif _action = 'cancel' then
      update public.user_subscriptions set status = 'CANCELLED', updated_at = now() where id = _sub.id; _audit := 'subscription_cancelled';
    elsif _action = 'suspend' then
      update public.user_subscriptions set status = 'SUSPENDED', updated_at = now() where id = _sub.id; _audit := 'subscription_suspended';
    else -- reactivate
      if _sub.expires_at is not null and _sub.expires_at <= now() then
        if coalesce(_months, 0) <= 0 then raise exception 'This subscription has expired. Choose how many months to reactivate for.'; end if;
        _exp := now() + make_interval(months => _months);
      else _exp := _sub.expires_at; end if;
      update public.user_subscriptions set status = 'ACTIVE', expires_at = _exp, updated_at = now() where id = _sub.id; _audit := 'subscription_reactivated';
    end if;
  end if;
  select * into _sub from public.user_subscriptions where user_id = _target;
  _new := jsonb_build_object('status', _sub.status, 'plan_id', _sub.plan_id, 'expires_at', _sub.expires_at, 'source', _sub.source);
  perform public.sub_audit(_admin, _target, _audit, _prev, _new, _reason);
  perform public.notify_user(_target, 'subscription_access_changed', 'Your plan was updated', 'Your Rentalos access has changed. Open Subscription to see the details.', '/subscription');
  return _new;
end $$;

-- ---------- admin discounts ----------
create or replace function public.admin_set_discount(
  _admin uuid, _target uuid, _plan_code text, _kind text, _value numeric, _months int,
  _starts timestamptz, _expires timestamptz, _reason text, _discount_id uuid default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare _plan record; _id uuid;
begin
  if coalesce(length(trim(_reason)), 0) = 0 then raise exception 'A reason is required.'; end if;
  select * into _plan from public.subscription_plans where code = _plan_code;
  if not found or _plan.code = 'FREE' then raise exception 'Discounts apply to paid plans only.'; end if;
  if _discount_id is null then
    insert into public.subscription_discounts (user_id, plan_id, kind, value, duration_months, starts_at, expires_at, reason, created_by)
      values (_target, _plan.id, _kind, case when _kind = 'free' then null else _value end, greatest(coalesce(_months, 1), 1),
              coalesce(_starts, now()), _expires, _reason, _admin) returning id into _id;
    perform public.sub_audit(_admin, _target, 'discount_created', '{}'::jsonb,
      jsonb_build_object('plan', _plan_code, 'kind', _kind, 'value', _value, 'months', _months), _reason);
  else
    update public.subscription_discounts set kind = _kind, value = case when _kind = 'free' then null else _value end,
      duration_months = greatest(coalesce(_months, 1), 1), starts_at = coalesce(_starts, starts_at), expires_at = _expires,
      reason = _reason, updated_at = now() where id = _discount_id and user_id = _target returning id into _id;
    if _id is null then raise exception 'Discount not found.'; end if;
    perform public.sub_audit(_admin, _target, 'discount_updated', '{}'::jsonb,
      jsonb_build_object('plan', _plan_code, 'kind', _kind, 'value', _value, 'months', _months), _reason);
  end if;
  perform public.notify_user(_target, 'subscription_discount_applied', 'A discount was added to your account', 'Open Subscription to see your price.', '/subscription');
  return _id;
end $$;

create or replace function public.admin_revoke_discount(_admin uuid, _discount uuid, _reason text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare _d record;
begin
  update public.subscription_discounts set active = false, updated_at = now() where id = _discount returning * into _d;
  if not found then raise exception 'Discount not found.'; end if;
  perform public.sub_audit(_admin, _d.user_id, 'discount_updated', jsonb_build_object('active', true), jsonb_build_object('active', false), coalesce(_reason, 'revoked'));
end $$;

-- ---------- admin feature overrides ----------
create or replace function public.admin_set_override(
  _admin uuid, _target uuid, _feature text, _enabled boolean, _expires timestamptz, _reason text) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare _id uuid;
begin
  if coalesce(length(trim(_reason)), 0) = 0 then raise exception 'A reason is required.'; end if;
  if not exists (select 1 from public.feature_catalog where feature_key = _feature and kind = 'feature') then raise exception 'Unknown feature.'; end if;
  update public.entitlement_overrides set revoked_at = now(), updated_at = now()
   where user_id = _target and feature_key = _feature and revoked_at is null;
  insert into public.entitlement_overrides (user_id, feature_key, enabled, expires_at, reason, created_by)
    values (_target, _feature, _enabled, _expires, _reason, _admin) returning id into _id;
  perform public.sub_audit(_admin, _target, 'feature_override_created', '{}'::jsonb,
    jsonb_build_object('feature', _feature, 'enabled', _enabled, 'expires_at', _expires), _reason);
  perform public.notify_user(_target, 'subscription_access_changed', 'Your access was updated', 'Open Subscription to see what is included.', '/subscription');
  return _id;
end $$;

create or replace function public.admin_revoke_override(_admin uuid, _override uuid, _reason text) returns void
language plpgsql security definer set search_path to 'public' as $$
declare _o record;
begin
  update public.entitlement_overrides set revoked_at = now(), updated_at = now() where id = _override and revoked_at is null returning * into _o;
  if not found then raise exception 'Override not found or already removed.'; end if;
  perform public.sub_audit(_admin, _o.user_id, 'feature_override_removed',
    jsonb_build_object('feature', _o.feature_key, 'enabled', _o.enabled), '{}'::jsonb, coalesce(_reason, 'removed'));
end $$;

-- ---------- expiry automation (idempotent; access is ALSO enforced lazily above) ----------
create or replace function public.cron_subscription_expiry() returns void
language plpgsql security definer set search_path to 'public' as $$
declare r record;
begin
  for r in
    select s.id, s.user_id, p.name from public.user_subscriptions s join public.subscription_plans p on p.id = s.plan_id
     where s.status = 'ACTIVE' and s.expires_at is not null
       and s.expires_at + make_interval(days => public.sub_grace_days()) <= now()
  loop
    begin
      update public.user_subscriptions set status = 'EXPIRED', updated_at = now() where id = r.id and status = 'ACTIVE';
      perform public.notify_user(r.user_id, 'subscription_expired', r.name || ' has expired',
        'Your data is safe. Renew to use ' || r.name || ' features again.', '/subscription');
    exception when others then null; end;
  end loop;
  for r in
    select s.id, s.user_id, s.expires_at, p.name from public.user_subscriptions s join public.subscription_plans p on p.id = s.plan_id
     where s.status = 'ACTIVE' and s.expires_at is not null and s.expires_at > now() and s.expires_at <= now() + interval '3 days'
  loop
    begin
      if public.claim_automation_slot('subscription_expiring', r.id, to_char(r.expires_at, 'YYYY-MM-DD'), 'subscription') then
        perform public.notify_user(r.user_id, 'subscription_expiring', r.name || ' expires soon',
          'Your plan ends on ' || to_char(r.expires_at, 'DD Mon YYYY') || '. Renew to keep access.', '/subscription');
      end if;
    exception when others then null; end;
  end loop;
end $$;

do $$ begin
  perform cron.unschedule('subscription-expiry-daily');
exception when others then null; end $$;
do $$ begin
  perform cron.schedule('subscription-expiry-daily', '30 9 * * *', 'select public.cron_subscription_expiry()');
exception when others then null; end $$;

-- ---------- database-level enforcement for browser-direct RentDesk writes ----------
-- RentDesk tables are written straight from the browser (RLS), so a server-function
-- check alone is not enough. Only the OWNER's own writes are gated: tenants raising
-- tickets / paying rent (service role) are unaffected. Reads stay open -> expired
-- accounts keep READ-ONLY access to their data.
create or replace function public.enforce_rentdesk_core() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare _owner uuid;
begin
  if public.is_trusted_db_session() or auth.uid() is null then return new; end if;
  -- meter_readings has no owner_id column: resolve the owner through the room.
  _owner := nullif(to_jsonb(new)->>'owner_id', '')::uuid;
  if _owner is null and nullif(to_jsonb(new)->>'room_id', '') is not null then
    select r.owner_id into _owner from public.rooms r where r.id = (to_jsonb(new)->>'room_id')::uuid;
  end if;
  if _owner is null or auth.uid() is distinct from _owner then return new; end if;
  if not public.has_entitlement(_owner, 'rentdesk_core') then
    raise exception 'RentDesk plan required: your subscription does not include this. Your data is safe and read-only. Renew from the Subscription page to make changes.'
      using hint = 'SUBSCRIPTION_REQUIRED:rentdesk_core';
  end if;
  return new;
end $$;

do $$ declare t text; begin
  foreach t in array array['tenants','bills','meter_readings','deposits','move_records','maintenance_tickets'] loop
    execute format('drop trigger if exists trg_enforce_rentdesk on public.%I', t);
    execute format('create trigger trg_enforce_rentdesk before insert or update on public.%I for each row execute function public.enforce_rentdesk_core()', t);
  end loop;
end $$;

create or replace function public.enforce_plan_limit() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare _key text := case tg_table_name when 'properties' then 'max_properties' else 'max_rooms' end;
        _limit int; _count int;
begin
  if public.is_trusted_db_session() or auth.uid() is distinct from new.owner_id then return new; end if;
  _limit := public.entitlement_limit(new.owner_id, _key);
  if _limit is null then return new; end if;
  execute format('select count(*) from public.%I where owner_id = $1', tg_table_name) into _count using new.owner_id;
  if _count >= _limit then
    raise exception 'Your plan allows % %. Upgrade to add more.', _limit, case tg_table_name when 'properties' then 'properties' else 'rooms' end
      using hint = 'LIMIT_REACHED:' || _key;
  end if;
  return new;
end $$;
drop trigger if exists trg_enforce_property_limit on public.properties;
create trigger trg_enforce_property_limit before insert on public.properties for each row execute function public.enforce_plan_limit();
drop trigger if exists trg_enforce_room_limit on public.rooms;
create trigger trg_enforce_room_limit before insert on public.rooms for each row execute function public.enforce_plan_limit();

-- ---------- close the legacy self-activation hole ----------
-- The old `subscriptions` table let any landlord INSERT/UPDATE their own row
-- (plan='pro', status='active') straight from the browser. Remove those writes.
drop policy if exists "Landlord upserts own subscription" on public.subscriptions;
drop policy if exists "Landlord updates own subscription request" on public.subscriptions;
revoke insert, update, delete on public.subscriptions from authenticated;
revoke insert, update, delete on public.myr_subscriptions from authenticated;

create or replace function public.landlord_plan(_uid uuid) returns text
language sql stable security definer set search_path to 'public' as $$
  select public.sub_effective_plan_code(_uid);
$$;

-- ---------- storage: private proofs, public QR ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('subscription-proofs', 'subscription-proofs', false, 5242880, array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = 5242880,
  allowed_mime_types = array['image/jpeg','image/png','image/webp','application/pdf'];
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('payment-qr', 'payment-qr', true, 2097152, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "sub proofs owner insert" on storage.objects;
create policy "sub proofs owner insert" on storage.objects for insert
  with check (bucket_id = 'subscription-proofs' and auth.uid()::text = (storage.foldername(name))[1]);
drop policy if exists "sub proofs owner read" on storage.objects;
create policy "sub proofs owner read" on storage.objects for select
  using (bucket_id = 'subscription-proofs' and (auth.uid()::text = (storage.foldername(name))[1] or is_admin(auth.uid())));
drop policy if exists "payment qr public read" on storage.objects;
create policy "payment qr public read" on storage.objects for select using (bucket_id = 'payment-qr');
drop policy if exists "payment qr admin write" on storage.objects;
create policy "payment qr admin write" on storage.objects for insert with check (bucket_id = 'payment-qr' and is_admin(auth.uid()));
drop policy if exists "payment qr admin update" on storage.objects;
create policy "payment qr admin update" on storage.objects for update using (bucket_id = 'payment-qr' and is_admin(auth.uid()));
drop policy if exists "payment qr admin delete" on storage.objects;
create policy "payment qr admin delete" on storage.objects for delete using (bucket_id = 'payment-qr' and is_admin(auth.uid()));

-- ---------- one-time migration of existing users ----------
do $$
declare _done boolean; r record; _rd uuid; _mg uuid;
begin
  select legacy_grandfather_done into _done from public.subscription_settings where id = 1;
  if coalesce(_done, false) then return; end if;
  select id into _rd from public.subscription_plans where code = 'RENTDESK';
  select id into _mg from public.subscription_plans where code = 'RENTALOS_MANAGEMENT';

  -- 1) honour genuinely-active legacy paid subscriptions
  insert into public.user_subscriptions (user_id, plan_id, status, starts_at, expires_at, source)
  select s.landlord_id, case s.plan when 'business' then _mg else _rd end, 'ACTIVE', s.started_at, s.expires_at, 'legacy_migration'
    from public.subscriptions s
   where s.plan in ('pro','business') and s.status = 'active' and (s.expires_at is null or s.expires_at > now())
  on conflict (user_id) do nothing;

  -- 2) existing landlords keep working: 90 days of complimentary RentDesk
  for r in
    select distinct owner_id from (select owner_id from public.properties union select owner_id from public.rooms) o
     where owner_id is not null and not exists (select 1 from public.user_subscriptions u where u.user_id = o.owner_id)
  loop
    insert into public.user_subscriptions (user_id, plan_id, status, starts_at, expires_at, source)
      values (r.owner_id, _rd, 'ACTIVE', now(), now() + interval '90 days', 'legacy_grandfather');
    begin
      perform public.notify_user(r.owner_id, 'subscription_access_changed', 'RentDesk is free for you for 90 days',
        'Thanks for being an early Rentalos landlord. Open Subscription to see the details.', '/subscription');
    exception when others then null; end;
  end loop;
  update public.subscription_settings set legacy_grandfather_done = true where id = 1;
end $$;

-- ---------- gate existing automation by entitlement ----------
-- Rent reminders need 'rent_reminders'; lease-expiry alerts need 'advanced_automation'.
create or replace function public.cron_bill_reminders()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  _days_out int;
  _checkpoint text;
  _period_key text;
  _outstanding numeric;
begin
  for r in
    select b.id, b.due_date, b.total_amount, b.amount_paid, b.tenant_id, b.owner_id,
           t.tenant_user_id, t.name as tname, rm.room_number
      from public.bills b
      join public.tenants t on t.id = b.tenant_id
      left join public.rooms rm on rm.id = b.room_id
     where public.has_entitlement(b.owner_id, 'rent_reminders')
       and b.status <> 'paid'
       and b.archived = false
       and b.due_date between current_date - interval '30 days' and current_date + interval '7 days'
  loop
    -- Per-row isolation: one bad row must never abort the rest of the
    -- run (Phase 15). Each iteration gets its own exception boundary.
    begin
      _outstanding := coalesce(r.total_amount, 0) - coalesce(r.amount_paid, 0);
      if _outstanding <= 0 then
        continue;
      end if;

      _days_out := r.due_date - current_date;

      -- Discrete checkpoints instead of a vague 3-day window, so each
      -- notification is distinct and idempotent on its own.
      _checkpoint := case
        when _days_out = 7 then 'due_in_7'
        when _days_out = 3 then 'due_in_3'
        when _days_out = 1 then 'due_in_1'
        when _days_out = 0 then 'due_today'
        when _days_out = -1 then 'overdue_1'
        when _days_out = -3 then 'overdue_3'
        when _days_out = -7 then 'overdue_7'
        when _days_out = -15 then 'overdue_15'
        when _days_out = -30 then 'overdue_30'
        else null
      end;

      if _checkpoint is null then
        continue;
      end if;

      _period_key := to_char(current_date, 'YYYY-MM-DD') || ':' || _checkpoint;

      -- Idempotency (Phase 8): claim the slot, or skip if already done.
      -- Safe to re-run this whole job any number of times per day.
      if not public.claim_automation_slot('rent_reminder', r.id, _period_key, 'bill') then
        continue;
      end if;

      if _days_out >= 0 then
        -- Upcoming / due today -> tenant in-app
        perform public.notify_user(
          r.tenant_user_id,
          'RENT_DUE',
          case when _days_out = 0
               then 'Rent due today'
               else 'Rent due in ' || _days_out || ' day(s)' end,
          '₹' || _outstanding::text || ' outstanding' ||
            coalesce(' · Room ' || r.room_number, ''),
          '/tenant');
      else
        -- Overdue -> tenant in-app, and landlord in-app so they can act
        perform public.notify_user(
          r.tenant_user_id,
          'RENT_OVERDUE',
          'Rent overdue by ' || abs(_days_out) || ' day(s)',
          '₹' || _outstanding::text || ' pending since ' || to_char(r.due_date, 'DD Mon'),
          '/tenant');

        perform public.notify_user(
          r.owner_id,
          'RENT_OVERDUE',
          'Overdue — ' || coalesce(r.tname, 'tenant'),
          '₹' || _outstanding::text || ' overdue by ' || abs(_days_out) || ' day(s)' ||
            coalesce(' · Room ' || r.room_number, ''),
          '/bills');
      end if;

      update public.bills set last_reminded_at = now() where id = r.id;

      perform public.finish_automation_slot(
        'rent_reminder', r.id, _period_key, 'completed', null,
        jsonb_build_object('checkpoint', _checkpoint, 'outstanding', _outstanding));

    exception when others then
      -- Record the failure against this entity and keep going.
      perform public.finish_automation_slot(
        'rent_reminder', r.id, _period_key, 'failed', sqlerrm, '{}'::jsonb);
    end;
  end loop;
end;
$function$;

create or replace function public.cron_lease_expiry()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  r record;
  _days_left int;
  _checkpoint text;
  _period_key text;
begin
  for r in
    select t.id, t.name, t.lease_end_date, t.tenant_user_id, t.owner_id, rm.room_number
      from public.tenants t
      left join public.rooms rm on rm.id = t.room_id
     where public.has_entitlement(t.owner_id, 'advanced_automation')
       and t.active = true
       and t.lease_end_date is not null
       and t.lease_end_date between current_date and current_date + interval '30 days'
  loop
    begin
      _days_left := r.lease_end_date - current_date;

      _checkpoint := case
        when _days_left = 30 then 'expiry_30'
        when _days_left = 15 then 'expiry_15'
        when _days_left = 7  then 'expiry_7'
        when _days_left = 3  then 'expiry_3'
        when _days_left = 1  then 'expiry_1'
        when _days_left = 0  then 'expiry_today'
        else null
      end;

      if _checkpoint is null then
        continue;
      end if;

      _period_key := to_char(current_date, 'YYYY-MM-DD') || ':' || _checkpoint;

      if not public.claim_automation_slot('lease_expiry', r.id, _period_key, 'tenant') then
        continue;
      end if;

      perform public.notify_user(
        r.tenant_user_id,
        'LEASE_EXPIRING',
        case when _days_left = 0
             then 'Your tenancy ends today'
             else 'Your tenancy ends in ' || _days_left || ' day(s)' end,
        'Ends ' || to_char(r.lease_end_date, 'DD Mon YYYY') ||
          coalesce(' · Room ' || r.room_number, '') ||
          '. Contact your landlord to renew or plan your move-out.',
        '/tenant');

      perform public.notify_user(
        r.owner_id,
        'LEASE_EXPIRING',
        coalesce(r.name, 'Tenant') || ' — tenancy ending',
        case when _days_left = 0 then 'Ends today' else 'Ends in ' || _days_left || ' day(s)' end ||
          coalesce(' · Room ' || r.room_number, ''),
        '/tenants');

      perform public.finish_automation_slot(
        'lease_expiry', r.id, _period_key, 'completed', null,
        jsonb_build_object('checkpoint', _checkpoint, 'days_left', _days_left));

    exception when others then
      perform public.finish_automation_slot(
        'lease_expiry', r.id, _period_key, 'failed', sqlerrm, '{}'::jsonb);
    end;
  end loop;
end;
$function$;

-- ---------- lock down RPC surface ----------
-- Supabase auto-grants EXECUTE on new public functions to anon/authenticated.
-- Every function below mutates subscription state or reveals another user's
-- entitlements, so only the server (service role) may call them. Triggers and
-- cron jobs run as the function owner and are unaffected.
do $$
declare f text;
begin
  foreach f in array array[
    'sub_audit(uuid,uuid,text,jsonb,jsonb,text)',
    'sub_grace_days()',
    'sub_effective_plan_code(uuid)',
    'has_entitlement(uuid,text)',
    'entitlement_limit(uuid,text)',
    'get_effective_entitlements(uuid)',
    'compute_payable(uuid,text)',
    'submit_subscription_payment(uuid,text,text,numeric,text,text)',
    'decide_subscription_payment(uuid,uuid,text,text)',
    'admin_apply_subscription_action(uuid,uuid,text,text,int,text)',
    'admin_set_discount(uuid,uuid,text,text,numeric,int,timestamptz,timestamptz,text,uuid)',
    'admin_revoke_discount(uuid,uuid,text)',
    'admin_set_override(uuid,uuid,text,boolean,timestamptz,text)',
    'admin_revoke_override(uuid,uuid,text)',
    'cron_subscription_expiry()'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
