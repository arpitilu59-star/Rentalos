-- Per-user push notification settings (categories + quiet hours). In-app inbox always shows everything.
create table if not exists public.notification_prefs (
  user_id uuid primary key,
  push_enabled boolean not null default true,
  rent boolean not null default true,
  bookings boolean not null default true,
  maintenance boolean not null default true,
  roommate boolean not null default true,
  account boolean not null default true,
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  tz_offset_min int not null default 330 check (tz_offset_min between -720 and 840),
  updated_at timestamptz not null default now()
);
alter table public.notification_prefs enable row level security;
drop policy if exists "notif prefs own read" on public.notification_prefs;
create policy "notif prefs own read" on public.notification_prefs for select to authenticated using (user_id = auth.uid());
grant select on public.notification_prefs to authenticated;
grant all on public.notification_prefs to service_role;
