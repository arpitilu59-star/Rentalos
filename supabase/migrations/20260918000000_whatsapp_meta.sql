-- Meta WhatsApp Cloud API integration (official platform only).
-- whatsapp_links: user <-> phone consent + verification.
-- whatsapp_messages: delivery log (NO message body stored).

create table if not exists public.whatsapp_links (
  user_id uuid primary key,
  phone_e164 text not null unique,
  verified boolean not null default false,
  opted_in boolean not null default false,
  linked_at timestamptz not null default now(),
  last_verified_at timestamptz
);
alter table public.whatsapp_links enable row level security;

drop policy if exists "own whatsapp link read" on public.whatsapp_links;
create policy "own whatsapp link read" on public.whatsapp_links
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "admins read whatsapp links" on public.whatsapp_links;
create policy "admins read whatsapp links" on public.whatsapp_links
  for select to authenticated using (is_admin(auth.uid()));
-- All writes go through server functions (service role) so a user can
-- never mark their own number verified.
grant select on public.whatsapp_links to authenticated;
grant all on public.whatsapp_links to service_role;

do $$ begin
  create type public.whatsapp_direction as enum ('outbound','inbound');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.whatsapp_status as enum ('queued','sent','delivered','read','failed','mocked','received');
exception when duplicate_object then null; end $$;

create table if not exists public.whatsapp_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  direction public.whatsapp_direction not null,
  event_type text not null,
  template text,
  provider_message_id text,
  status public.whatsapp_status not null default 'queued',
  failure_reason text,
  attempts integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists uq_whatsapp_provider_msg
  on public.whatsapp_messages (provider_message_id, direction)
  where provider_message_id is not null;
create index if not exists idx_whatsapp_messages_created on public.whatsapp_messages (created_at desc);
create index if not exists idx_whatsapp_messages_status on public.whatsapp_messages (status, created_at desc);

alter table public.whatsapp_messages enable row level security;
drop policy if exists "admins read whatsapp messages" on public.whatsapp_messages;
create policy "admins read whatsapp messages" on public.whatsapp_messages
  for select to authenticated using (is_admin(auth.uid()));
grant select on public.whatsapp_messages to authenticated;
grant all on public.whatsapp_messages to service_role;
