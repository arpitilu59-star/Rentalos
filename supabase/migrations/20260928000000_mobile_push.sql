-- Mobile app: device push tokens + "push already sent" marker on in-app notifications.
create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  token text not null unique,
  platform text not null default 'android' check (platform in ('android','ios')),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists idx_push_tokens_user on public.push_tokens (user_id);
alter table public.push_tokens enable row level security;
drop policy if exists "push tokens own read" on public.push_tokens;
create policy "push tokens own read" on public.push_tokens for select to authenticated using (user_id = auth.uid());
grant select on public.push_tokens to authenticated;
grant all on public.push_tokens to service_role;

alter table public.myr_notifications add column if not exists push_sent_at timestamptz;
create index if not exists idx_myr_notif_push_pending on public.myr_notifications (created_at) where push_sent_at is null;
