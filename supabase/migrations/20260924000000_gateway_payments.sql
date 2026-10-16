-- Automatic subscription activation through a payment gateway (Razorpay).
-- Flow: server creates a gateway order -> DRAFT payment row -> user pays -> signed webhook /
-- verified checkout callback -> settle_gateway_payment() activates the plan in one atomic,
-- idempotent step. Manual UPI-QR proof review keeps working unchanged as the fallback.

alter table public.subscription_payments add column if not exists gateway text;
alter table public.subscription_payments add column if not exists gateway_order_id text;
alter table public.subscription_payments add column if not exists gateway_payment_id text;
create unique index if not exists uq_sub_payment_gateway_order
  on public.subscription_payments (gateway, gateway_order_id) where gateway_order_id is not null;
create unique index if not exists uq_sub_payment_gateway_payment
  on public.subscription_payments (gateway, gateway_payment_id) where gateway_payment_id is not null;

-- Step 1: reserve a DRAFT payment for an order the server just created with the gateway.
-- The amount is ALWAYS the database-computed payable (discounts included), never the client's.
create or replace function public.create_gateway_payment(_uid uuid, _plan_code text, _gateway text, _order_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare _plan record; _pay jsonb; _payable numeric; _id uuid;
begin
  select * into _plan from public.subscription_plans where code = _plan_code;
  if not found or _plan.code = 'FREE' or not _plan.active then raise exception 'This plan cannot be purchased.'; end if;
  _pay := public.compute_payable(_uid, _plan_code);
  _payable := (_pay->>'payable')::numeric;
  if _payable <= 0 then raise exception 'No payment is needed for this plan.'; end if;
  insert into public.subscription_payments (user_id, plan_id, amount, original_amount, discount_amount, discount_id,
      claimed_amount, payment_method, status, gateway, gateway_order_id)
    values (_uid, _plan.id, _payable, (_pay->>'original')::numeric, (_pay->>'discount')::numeric,
      nullif(_pay->>'discount_id','')::uuid, _payable, _gateway, 'DRAFT', _gateway, _order_id)
    returning id into _id;
  return jsonb_build_object('payment_id', _id, 'payable', _payable);
end $$;

-- Quote only (used to create the gateway order for the exact amount).
create or replace function public.gateway_quote(_uid uuid, _plan_code text) returns numeric
language plpgsql stable security definer set search_path to 'public' as $$
declare _plan record;
begin
  select * into _plan from public.subscription_plans where code = _plan_code;
  if not found or _plan.code = 'FREE' or not _plan.active then raise exception 'This plan cannot be purchased.'; end if;
  return (public.compute_payable(_uid, _plan_code)->>'payable')::numeric;
end $$;

-- Step 2: money is confirmed (signature already verified by the server). Idempotent: calling it
-- again for the same order/payment is a no-op that reports 'ALREADY_APPLIED'.
create or replace function public.settle_gateway_payment(
  _gateway text, _order_id text, _gateway_payment_id text, _amount_paise bigint) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare _p record; _plan record; _sub record; _base timestamptz; _exp timestamptz; _prev jsonb;
begin
  select * into _p from public.subscription_payments
   where gateway = _gateway and gateway_order_id = _order_id for update;
  if not found then raise exception 'Unknown order.'; end if;
  if _p.status = 'APPROVED' then return jsonb_build_object('status', 'ALREADY_APPLIED'); end if;
  if _p.status not in ('DRAFT','PENDING_REVIEW') then raise exception 'Payment is % and cannot be settled.', _p.status; end if;
  if _amount_paise is distinct from round(_p.amount * 100)::bigint then
    update public.subscription_payments set admin_note = 'Gateway amount mismatch: got ' || coalesce(_amount_paise::text, 'null') || ' paise, expected ' || round(_p.amount * 100)::text,
           status = 'PENDING_REVIEW', gateway_payment_id = _gateway_payment_id, transaction_reference = _gateway_payment_id, submitted_at = now()
     where id = _p.id;
    return jsonb_build_object('status', 'AMOUNT_MISMATCH');
  end if;

  select * into _plan from public.subscription_plans where id = _p.plan_id;
  select * into _sub from public.user_subscriptions where user_id = _p.user_id for update;
  if not found then
    insert into public.user_subscriptions (user_id, plan_id, status, source, payment_status)
      values (_p.user_id, _p.plan_id, 'PENDING', 'payment', 'PENDING_REVIEW') returning * into _sub;
  end if;
  if _sub.status = 'SUSPENDED' then
    -- money is in, but an admin suspended this account: never auto-lift that, send it to manual review
    update public.subscription_payments set status = 'PENDING_REVIEW', gateway_payment_id = _gateway_payment_id,
           transaction_reference = _gateway_payment_id, submitted_at = now(),
           admin_note = 'Paid via ' || _gateway || ' but the account is suspended - review manually'
     where id = _p.id;
    return jsonb_build_object('status', 'SUSPENDED_REVIEW');
  end if;
  _prev := jsonb_build_object('payment_status', _p.status, 'subscription_status', _sub.status, 'plan_id', _sub.plan_id, 'expires_at', _sub.expires_at);

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
  update public.subscription_payments
     set status = 'APPROVED', reviewed_at = now(), reviewed_by = null, gateway_payment_id = _gateway_payment_id,
         transaction_reference = _gateway_payment_id, subscription_id = _sub.id,
         admin_note = 'Auto-approved: ' || _gateway || ' payment verified'
   where id = _p.id;
  if _p.discount_id is not null then
    update public.subscription_discounts set periods_used = periods_used + 1, updated_at = now() where id = _p.discount_id;
  end if;
  perform public.notify_user(_p.user_id, 'subscription_payment_approved', 'Payment received',
    _plan.name || ' is active until ' || to_char(_exp, 'DD Mon YYYY') || '.', '/subscription');
  perform public.notify_user(_p.user_id, 'subscription_activated', _plan.name || ' activated', 'Your plan is now active.', '/subscription');
  perform public.sub_audit(null, _p.user_id, 'payment_auto_approved', _prev,
    jsonb_build_object('payment_status', 'APPROVED', 'subscription_status', 'ACTIVE', 'plan_id', _p.plan_id, 'expires_at', _exp),
    _gateway || ' ' || _gateway_payment_id);
  return jsonb_build_object('status', 'APPROVED', 'expires_at', _exp, 'user_id', _p.user_id);
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'create_gateway_payment(uuid,text,text,text)', 'gateway_quote(uuid,text)',
    'settle_gateway_payment(text,text,text,bigint)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
