-- Parking Intelligence.
--
-- Audit finding: parking did NOT exist as structured data. The only
-- trace was the literal string 'parking' as one row in myr_amenities —
-- a yes/no checkbox with no meaning behind it. A tenant could not tell
-- whether "parking" meant a reserved covered slot owned by the
-- landlord, or simply that people park on the street outside.
--
-- Columns live on `rooms` (not properties) because parking allocation
-- realistically differs per unit within the same building — one tenant
-- gets a reserved slot, another doesn't.
--
-- The critical honesty rule from the spec is enforced in the DB, not
-- just the UI: street/nearby parking can never be recorded as
-- landlord-provided (covered/reserved/free), because those attributes
-- are meaningless for parking the landlord doesn't control.

do $$ begin
  create type public.parking_kind as enum (
    'dedicated',    -- landlord-owned slot assigned to this room
    'shared',       -- landlord-owned, shared among tenants
    'nearby',       -- an off-site paid/public facility near the property
    'street',       -- public street parking; NOT owned by the landlord
    'none',         -- explicitly no parking
    'unspecified'   -- landlord has not answered yet (default)
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.parking_vehicle as enum ('two_wheeler', 'four_wheeler', 'both');
exception when duplicate_object then null; end $$;

alter table public.rooms
  add column if not exists parking_kind public.parking_kind not null default 'unspecified',
  add column if not exists parking_vehicle public.parking_vehicle,
  add column if not exists parking_covered boolean,
  add column if not exists parking_reserved boolean,
  add column if not exists parking_paid boolean,
  add column if not exists parking_distance_m integer,
  add column if not exists parking_notes text;

-- Enforce the "never misrepresent public parking as landlord-owned"
-- rule at the database level.
do $$ begin
  alter table public.rooms add constraint rooms_parking_ownership_check check (
    -- street / nearby / none / unspecified: landlord-controlled
    -- attributes must be NULL, since the landlord does not control them
    (parking_kind in ('street','nearby','none','unspecified')
       and parking_covered is null
       and parking_reserved is null)
    or parking_kind in ('dedicated','shared')
  );
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table public.rooms add constraint rooms_parking_none_check check (
    parking_kind <> 'none'
    or (parking_vehicle is null and parking_paid is null and parking_distance_m is null)
  );
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table public.rooms add constraint rooms_parking_distance_check
    check (parking_distance_m is null or (parking_distance_m >= 0 and parking_distance_m <= 5000));
exception when duplicate_table then null; when duplicate_object then null; end $$;

-- Supports the public "has parking" browse filter without a full scan.
create index if not exists idx_rooms_parking_kind
  on public.rooms (parking_kind)
  where is_public = true and parking_kind <> 'unspecified';

-- No RLS changes needed: these are columns on `rooms`, already covered
-- by the existing "MYR public rooms browse" (public read of public
-- rooms) and "own rooms all" (landlord writes own rooms) policies.
