-- ================================================================
-- Trust & Verification system — one connected flow across:
--  1. Live-feed video: admin becomes the final decider (not raw GPS)
--  2. Verified badge -> clickable to watch the actual video
--  3. "Last verified on [date]" (via expires_at)
--  4. Duplicate-photo fraud detection
--  5. Verification expires after 150 days (re-verification required)
--  6. "Report mismatch" button -> reuses existing fraud_flags + admin fraud page
--  7. Post-visit review asks "did it match what you saw online?"
--  8. Landlord KYC required before a room can be published to MYR
--  9. Money-back guarantee — policy text only, added in the UI (no schema)
-- ================================================================

alter table public.live_feed_videos
  add column if not exists reviewed_by uuid,
  add column if not exists reviewed_at timestamp with time zone,
  add column if not exists expires_at timestamp with time zone;

-- #7 — room-level reviews, scoped correctly to the rooms/bookings tables
-- that the live app actually uses (myr_reviews is tied to the separate,
-- currently-unused myr_listings/myr_bookings subsystem — reusing it here
-- would violate its foreign keys, so this is a small dedicated table).
create table if not exists public.room_reviews (
  "id" uuid default gen_random_uuid() not null,
  "room_id" uuid not null,
  "tenant_user_id" uuid not null,
  "rating" integer not null,
  "body" text,
  "matched_expectations" boolean,
  "created_at" timestamp with time zone default now() not null
);

do $$ begin
  alter table room_reviews add constraint "room_reviews_pkey" primary key (id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table room_reviews add constraint "room_reviews_rating_check" check (rating >= 1 and rating <= 5);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table room_reviews add constraint "room_reviews_room_id_fkey" foreign key (room_id) references rooms(id) on delete cascade;
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table room_reviews add constraint "room_reviews_tenant_user_id_fkey" foreign key (tenant_user_id) references auth.users(id) on delete cascade;
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table room_reviews add constraint "room_reviews_one_per_booking" unique (room_id, tenant_user_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

create index if not exists idx_room_reviews_room on public.room_reviews (room_id);

alter table public.room_reviews enable row level security;

drop policy if exists "room reviews public read" on public.room_reviews;
create policy "room reviews public read" on public.room_reviews
  as permissive for select to public using (true);

drop policy if exists "room reviews tenant write" on public.room_reviews;
create policy "room reviews tenant write" on public.room_reviews
  as permissive for insert to authenticated
  with check (
    auth.uid() = tenant_user_id
    and exists (
      select 1 from bookings b
      where b.room_id = room_reviews.room_id
        and b.tenant_user_id = auth.uid()
        and b.status = 'accepted'
    )
  );

grant select, insert on public.room_reviews to authenticated;
grant select on public.room_reviews to anon;
grant all on public.room_reviews to service_role;

-- #4 — duplicate-photo fingerprints (exact-duplicate detection via file hash)
create table if not exists public.photo_fingerprints (
  "hash" text not null,
  "room_id" uuid not null,
  "owner_id" uuid not null,
  "created_at" timestamp with time zone default now() not null
);

do $$ begin
  alter table photo_fingerprints add constraint "photo_fingerprints_pkey" primary key (hash, room_id);
exception when duplicate_table then null; when duplicate_object then null; end $$;

do $$ begin
  alter table photo_fingerprints add constraint "photo_fingerprints_room_id_fkey" foreign key (room_id) references rooms(id) on delete cascade;
exception when duplicate_table then null; when duplicate_object then null; end $$;

create index if not exists idx_photo_fingerprints_hash on public.photo_fingerprints (hash);

alter table public.photo_fingerprints enable row level security;

drop policy if exists "photo fingerprints owner write" on public.photo_fingerprints;
create policy "photo fingerprints owner write" on public.photo_fingerprints
  as permissive for insert to authenticated
  with check (auth.uid() = owner_id);

drop policy if exists "photo fingerprints admin read" on public.photo_fingerprints;
create policy "photo fingerprints admin read" on public.photo_fingerprints
  as permissive for select to authenticated using (is_admin(auth.uid()));

grant select, insert on public.photo_fingerprints to authenticated;
grant all on public.photo_fingerprints to service_role;
