-- Lease expiry automation.
--
-- Previous blocker: there is no `leases` table, and `tenants` had only
-- move_in_date — nothing that says when a tenancy ends, so expiry was
-- impossible to detect.
--
-- Deliberately NOT creating a separate `leases` table: this app models
-- one active tenancy per tenant row (tenants.active), and every
-- downstream feature (bills, deposits, moves) already keys off
-- tenants.id. A parallel lease table would duplicate that relationship
-- and require rewiring working features. Adding the end date to the
-- existing row is the smaller, safer change.

alter table public.tenants
  add column if not exists lease_end_date date,
  add column if not exists lease_notice_days integer not null default 30;

create index if not exists idx_tenants_lease_end
  on public.tenants (lease_end_date)
  where active = true and lease_end_date is not null;

-- Checkpoint-based expiry notifications, in-app only (tenant +
-- landlord), idempotent per checkpoint via claim_automation_slot, with
-- per-row error isolation so one bad tenancy can't halt the run.
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
     where t.active = true
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

-- Schedule alongside the existing daily rent job (09:00). pg_cron is
-- already enabled by an earlier migration.
do $$ begin
  perform cron.unschedule('lease-expiry-daily');
exception when others then null; end $$;

select cron.schedule('lease-expiry-daily', '15 9 * * *', $$select public.cron_lease_expiry()$$);
