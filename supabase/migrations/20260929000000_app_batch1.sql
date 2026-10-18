-- Mobile app batch 1: saved rooms + private bucket for maintenance ticket photos.
create table if not exists public.app_saved_rooms (
  user_id uuid not null default auth.uid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, room_id)
);
alter table public.app_saved_rooms enable row level security;
drop policy if exists "saved rooms own all" on public.app_saved_rooms;
create policy "saved rooms own all" on public.app_saved_rooms for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, delete on public.app_saved_rooms to authenticated;
grant all on public.app_saved_rooms to service_role;

insert into storage.buckets (id, name, public) values ('ticket-photos', 'ticket-photos', false)
  on conflict (id) do nothing;
