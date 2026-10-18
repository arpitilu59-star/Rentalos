-- Mobile app: tenant identity documents (admin-verified) and tenant-submitted meter readings
-- (landlord approves / edits before anything reaches a bill).

-- ---------- identity documents ----------
create table if not exists public.tenant_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  doc_type text not null check (doc_type in ('aadhaar','pan','driving_license','voter_id','passport','college_id','photo')),
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  admin_note text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_tenant_docs_user on public.tenant_documents (user_id);
create index if not exists idx_tenant_docs_pending on public.tenant_documents (created_at) where status = 'pending';
alter table public.tenant_documents enable row level security;
drop policy if exists "tenant docs own read" on public.tenant_documents;
create policy "tenant docs own read" on public.tenant_documents for select to authenticated using (user_id = auth.uid());
grant select on public.tenant_documents to authenticated;
grant all on public.tenant_documents to service_role;

-- A tenant is "verified" once an admin has approved at least one government/college ID of theirs.
create or replace function public.tenant_verified(_uid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (select 1 from public.tenant_documents
                  where user_id = _uid and status = 'verified' and doc_type <> 'photo');
$$;
grant execute on function public.tenant_verified(uuid) to authenticated, service_role;

insert into storage.buckets (id, name, public) values ('tenant-docs', 'tenant-docs', false)
  on conflict (id) do nothing;

-- ---------- tenant-submitted meter readings ----------
create table if not exists public.meter_submissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  owner_id uuid not null,
  submitted_by uuid not null,
  reading numeric not null check (reading >= 0),
  photo_path text,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_reading numeric,
  landlord_note text,
  decided_at timestamptz,
  meter_reading_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists idx_meter_sub_owner on public.meter_submissions (owner_id, status, created_at desc);
create index if not exists idx_meter_sub_tenant on public.meter_submissions (tenant_id, created_at desc);
create unique index if not exists uq_meter_sub_one_pending on public.meter_submissions (tenant_id, room_id) where status = 'pending';
alter table public.meter_submissions enable row level security;
drop policy if exists "meter sub own read" on public.meter_submissions;
create policy "meter sub own read" on public.meter_submissions for select to authenticated
  using (submitted_by = auth.uid() or owner_id = auth.uid());
grant select on public.meter_submissions to authenticated;
grant all on public.meter_submissions to service_role;

-- Landlord decision, atomic. Only an APPROVED submission creates a meter_readings row (the table bills read from).
-- The landlord may correct the number; a reading can never go below the last recorded one.
create or replace function public.decide_meter_submission(_owner uuid, _id uuid, _approve boolean, _reading numeric, _note text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare s record; _last numeric; _final numeric; _mid uuid;
begin
  select * into s from public.meter_submissions where id = _id and owner_id = _owner for update;
  if not found then raise exception 'Reading not found.'; end if;
  if s.status <> 'pending' then raise exception 'This reading was already %.', s.status; end if;
  if not _approve then
    update public.meter_submissions set status = 'rejected', landlord_note = left(_note, 300), decided_at = now() where id = _id;
    return jsonb_build_object('status', 'rejected');
  end if;
  _final := coalesce(_reading, s.reading);
  if _final < 0 then raise exception 'Reading cannot be negative.'; end if;
  select reading into _last from public.meter_readings where room_id = s.room_id order by reading_date desc, created_at desc limit 1;
  if _last is not null and _final < _last then
    raise exception 'Reading cannot be lower than the last recorded reading (%).', _last;
  end if;
  insert into public.meter_readings (owner_id, room_id, reading, reading_date, photo_path, ai_detected, notes)
    values (s.owner_id, s.room_id, _final, current_date, s.photo_path, false, 'Submitted by tenant, approved by landlord')
    returning id into _mid;
  update public.meter_submissions
     set status = 'approved', approved_reading = _final, landlord_note = left(_note, 300), decided_at = now(), meter_reading_id = _mid
   where id = _id;
  return jsonb_build_object('status', 'approved', 'reading', _final, 'meter_reading_id', _mid);
end $$;
revoke all on function public.decide_meter_submission(uuid, uuid, boolean, numeric, text) from public, anon, authenticated;
grant execute on function public.decide_meter_submission(uuid, uuid, boolean, numeric, text) to service_role;
