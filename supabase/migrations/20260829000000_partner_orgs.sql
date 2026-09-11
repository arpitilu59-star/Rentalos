create table if not exists public.partner_organizations (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "contact_email" text,
  "contact_phone" text,
  "verified" boolean not null default true,
  "created_by" uuid,
  "created_at" timestamp with time zone default now() not null
);

do $$ begin
  alter table partner_organizations add constraint "partner_organizations_pkey" primary key (id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

create table if not exists public.partner_org_members (
  "org_id" uuid not null,
  "user_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

do $$ begin
  alter table partner_org_members add constraint "partner_org_members_pkey" primary key (org_id, user_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table partner_org_members add constraint "partner_org_members_org_id_fkey" foreign key (org_id) references partner_organizations(id) on delete cascade;
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table partner_org_members add constraint "partner_org_members_user_id_fkey" foreign key (user_id) references auth.users(id) on delete cascade;
exception when duplicate_table then null; when duplicate_object then null; end $$;

alter table public.properties
  add column if not exists source text not null default 'native',
  add column if not exists partner_org_id uuid,
  add column if not exists external_ref_id text;

alter table public.rooms
  add column if not exists source text not null default 'native',
  add column if not exists partner_org_id uuid,
  add column if not exists external_ref_id text;

do $$ begin
  alter table properties add constraint "properties_partner_org_id_fkey" foreign key (partner_org_id) references partner_organizations(id) on delete set null;
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table rooms add constraint "rooms_partner_org_id_fkey" foreign key (partner_org_id) references partner_organizations(id) on delete set null;
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table properties add constraint "uq_properties_partner_ext" unique (partner_org_id, external_ref_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table rooms add constraint "uq_rooms_partner_ext" unique (partner_org_id, external_ref_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

alter table public.partner_organizations enable row level security;
alter table public.partner_org_members enable row level security;

drop policy if exists "admins manage partner orgs" on public.partner_organizations;
create policy "admins manage partner orgs" on public.partner_organizations
  as permissive for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists "members read own org" on public.partner_organizations;
create policy "members read own org" on public.partner_organizations
  as permissive for select to authenticated
  using (exists (select 1 from partner_org_members m where m.org_id = id and m.user_id = auth.uid()));

drop policy if exists "admins manage partner members" on public.partner_org_members;
create policy "admins manage partner members" on public.partner_org_members
  as permissive for all to authenticated
  using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

drop policy if exists "own membership read" on public.partner_org_members;
create policy "own membership read" on public.partner_org_members
  as permissive for select to authenticated
  using (user_id = auth.uid());

grant select on public.partner_organizations, public.partner_org_members to authenticated;
grant all on public.partner_organizations, public.partner_org_members to service_role;
