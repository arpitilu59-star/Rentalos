-- In-app roommate chat (+ video call links). Contact details (phone/email) are never exposed:
-- matched users talk inside Rentalos. A conversation starts as a request the other person must accept.
create table if not exists public.roommate_threads (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  recipient_id uuid not null,
  status text not null default 'pending' check (status in ('pending','active','declined','blocked')),
  blocked_by uuid,
  last_message text,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (requester_id <> recipient_id)
);
create unique index if not exists uq_roommate_thread_pair
  on public.roommate_threads (least(requester_id, recipient_id), greatest(requester_id, recipient_id));
create index if not exists idx_roommate_threads_req on public.roommate_threads (requester_id, last_message_at desc);
create index if not exists idx_roommate_threads_rec on public.roommate_threads (recipient_id, last_message_at desc);

create table if not exists public.roommate_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.roommate_threads(id) on delete cascade,
  sender_id uuid not null,
  kind text not null default 'text' check (kind in ('text','call')),
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists idx_roommate_messages_thread on public.roommate_messages (thread_id, created_at);

alter table public.roommate_threads enable row level security;
alter table public.roommate_messages enable row level security;

-- Participants may read; every write goes through server functions (service role).
drop policy if exists "rm threads participants read" on public.roommate_threads;
create policy "rm threads participants read" on public.roommate_threads for select to authenticated
  using (auth.uid() in (requester_id, recipient_id));
drop policy if exists "rm messages participants read" on public.roommate_messages;
create policy "rm messages participants read" on public.roommate_messages for select to authenticated
  using (exists (select 1 from public.roommate_threads t
                  where t.id = thread_id and auth.uid() in (t.requester_id, t.recipient_id)));

grant select on public.roommate_threads, public.roommate_messages to authenticated;
grant all on public.roommate_threads, public.roommate_messages to service_role;
