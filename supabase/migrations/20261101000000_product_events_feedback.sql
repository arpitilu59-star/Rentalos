-- First-party product analytics + in-product feedback (audit items: analytics, feedback, support).
-- No third-party tracking; props must never carry PII (enforced in the server layer by an allow-list).

create table if not exists public.product_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'unknown' check (role in ('landlord','tenant','admin','unknown')),
  event text not null check (char_length(event) between 1 and 60),
  platform text not null default 'web' check (platform in ('web','android','ios','server')),
  props jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_product_events_event_time on public.product_events (event, created_at desc);
create index if not exists idx_product_events_user_time on public.product_events (user_id, created_at desc);
alter table public.product_events enable row level security;

-- Users may only insert their own events; only active admins can read. (Server also writes with the service role.)
drop policy if exists "product_events insert own" on public.product_events;
create policy "product_events insert own" on public.product_events
  for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "product_events admin read" on public.product_events;
create policy "product_events admin read" on public.product_events
  for select to authenticated using (
    exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.active)
  );

create table if not exists public.feedback_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  role text not null default 'unknown' check (role in ('landlord','tenant','admin','unknown')),
  kind text not null check (kind in ('bug','idea','support','other')),
  body text not null check (char_length(body) between 3 and 2000),
  screen text check (screen is null or char_length(screen) <= 120),
  platform text not null default 'web' check (platform in ('web','android','ios')),
  app_version text check (app_version is null or char_length(app_version) <= 40),
  status text not null default 'open' check (status in ('open','in_progress','resolved','wont_fix')),
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_feedback_status_time on public.feedback_items (status, created_at desc);
create index if not exists idx_feedback_user on public.feedback_items (user_id, created_at desc);
alter table public.feedback_items enable row level security;

drop policy if exists "feedback insert own" on public.feedback_items;
create policy "feedback insert own" on public.feedback_items
  for insert to authenticated with check (user_id = auth.uid() and status = 'open' and admin_notes is null);
drop policy if exists "feedback read own" on public.feedback_items;
create policy "feedback read own" on public.feedback_items
  for select to authenticated using (user_id = auth.uid());
drop policy if exists "feedback admin all" on public.feedback_items;
create policy "feedback admin all" on public.feedback_items
  for all to authenticated
  using (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.active))
  with check (exists (select 1 from public.admin_users a where a.user_id = auth.uid() and a.active));
