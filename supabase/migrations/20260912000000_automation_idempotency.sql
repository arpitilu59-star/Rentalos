-- Automation reliability foundation (Phases 6, 8, 15, 18).
--
-- Audit finding: this project ALREADY has a working scheduler —
-- pg_cron is enabled and `cron_bill_reminders()` is scheduled daily at
-- 09:00 (migration 20260704045731). So no new scheduler infrastructure
-- (Vercel Cron / n8n) is needed; automation belongs in Postgres where
-- it already lives. What was missing is the reliability layer around
-- it: idempotency, structured logging, and duplicate protection.

-- ============================================================
-- 1) Duplicate-bill protection (Phase 6)
-- bills already has bill_month / bill_year / bill_kind (added in
-- 20260701004109) but NO unique constraint — so a re-run of any
-- billing routine could silently create a second bill for the same
-- tenant + month. This makes that impossible at the DB level.
-- Scoped to 'monthly' only: move_in/move_out/adhoc bills can
-- legitimately repeat within a month.
-- ============================================================
create unique index if not exists uq_bills_monthly_period
  on public.bills (tenant_id, bill_year, bill_month)
  where bill_kind = 'monthly' and tenant_id is not null and archived = false;

-- ============================================================
-- 2) Automation run log (Phases 8, 15, 18)
-- One row per (job, entity, period) attempt. The unique index is the
-- idempotency mechanism: an automation claims its slot by inserting,
-- and a duplicate insert simply fails, so re-running a job is safe.
-- Also doubles as the structured observability log — every run records
-- what happened, to which entity, when, and whether it succeeded.
-- ============================================================
create table if not exists public.automation_runs (
  "id" uuid default gen_random_uuid() not null,
  "job" text not null,
  "entity_type" text,
  "entity_id" uuid,
  "period_key" text not null,
  "status" text not null default 'started',
  "detail" jsonb default '{}'::jsonb not null,
  "error" text,
  "created_at" timestamp with time zone default now() not null,
  "completed_at" timestamp with time zone
);

do $$ begin
  alter table automation_runs add constraint "automation_runs_pkey" primary key (id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table automation_runs add constraint "automation_runs_status_check"
    check (status in ('started','completed','skipped','failed'));
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- The idempotency key. period_key is caller-defined and deterministic,
-- e.g. '2026-09' for a monthly job, '2026-09-12' for a daily one,
-- or '2026-09-12:due_in_3' for a specific reminder checkpoint.
create unique index if not exists uq_automation_runs_slot
  on public.automation_runs (job, entity_id, period_key);

create index if not exists idx_automation_runs_recent
  on public.automation_runs (created_at desc);

create index if not exists idx_automation_runs_failed
  on public.automation_runs (job, created_at desc)
  where status = 'failed';

alter table public.automation_runs enable row level security;

-- Automation runs are internal operational data: admins read, the
-- service role (used by scheduled jobs / server functions) writes.
-- No tenant/landlord/public access at all.
drop policy if exists "admins read automation runs" on public.automation_runs;
create policy "admins read automation runs" on public.automation_runs
  as permissive for select to authenticated
  using (is_admin(auth.uid()));

grant select on public.automation_runs to authenticated;
grant all on public.automation_runs to service_role;

-- ============================================================
-- 3) Idempotency helper (Phase 8)
-- Returns true if the caller successfully claimed the slot (i.e. this
-- action has NOT run before and should proceed now), false if it was
-- already taken (skip). Safe under concurrency — relies on the unique
-- index rather than a read-then-write race.
-- ============================================================
create or replace function public.claim_automation_slot(
  _job text,
  _entity_id uuid,
  _period_key text,
  _entity_type text default null
)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into public.automation_runs (job, entity_type, entity_id, period_key, status)
  values (_job, _entity_type, _entity_id, _period_key, 'started');
  return true;
exception when unique_violation then
  return false;
end;
$function$;

create or replace function public.finish_automation_slot(
  _job text,
  _entity_id uuid,
  _period_key text,
  _status text,
  _error text default null,
  _detail jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.automation_runs
     set status = _status,
         error = _error,
         detail = _detail,
         completed_at = now()
   where job = _job and entity_id = _entity_id and period_key = _period_key;
end;
$function$;
