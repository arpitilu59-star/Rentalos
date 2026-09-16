-- Rent reminder automation, hardened (Phases 5, 15, 18).
--
-- Replaces the existing cron_bill_reminders() body. What the old one
-- did: fired reminders for bills due within 3 days, throttled only by a
-- 20-hour last_reminded_at check. Problems that fixes address below:
--   * a single failing row aborted the whole run (no per-row isolation)
--   * "within 3 days" meant a tenant could get the same generic nudge
--     on 3 consecutive days with no distinction, and the 20h throttle
--     silently suppressed legitimately-different checkpoints
--   * no record of what ran, for whom, or whether it worked
--   * no overdue handling at all
--
-- Business rule honoured: tenant + landlord notifications are IN-APP
-- only (via the existing notify_user() -> myr_notifications). No email
-- is sent to tenants or landlords anywhere in this job.
--
-- The existing cron schedule ('bill-reminders-daily', 09:00) is left
-- untouched and keeps calling this same function name.

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
     where b.status <> 'paid'
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
