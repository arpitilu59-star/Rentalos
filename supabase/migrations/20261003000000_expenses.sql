-- Landlord expenses (RentDesk app): repairs, electricity bill, salaries, etc. Owner-only.
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  property_id uuid references public.properties(id) on delete set null,
  category text not null check (category in ('repair','electricity','water','salary','tax','internet','cleaning','other')),
  amount numeric(12,2) not null check (amount > 0 and amount <= 10000000),
  spent_on date not null default current_date,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists idx_expenses_owner_date on public.expenses (owner_id, spent_on desc);

alter table public.expenses enable row level security;
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;

do $$ begin
  create policy "expenses owner all" on public.expenses
    for all using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
exception when duplicate_object then null; end $$;
