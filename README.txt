Society/property-manager integration — Phase 1 (CSV bulk import)
PLUS: the myr-landlord-cleanup fix from earlier that hadn't been
pushed yet — bundled in here too since this delivery builds on it.
====================================================================

RUN THESE 2 MIGRATIONS FIRST (in order)
------------------------------------------
1. 20260822000000_verification_review_lockdown.sql
   (you may have already run this — re-running is safe, it's idempotent)
2. 20260829000000_partner_orgs.sql  <- NEW, run this one for sure

INSTALL 1 NEW DEPENDENCY
-------------------------
npm install   (pulls in papaparse — the only new package; framer-motion
               was already added earlier)

FILES — NEW (6)
----------------
src/lib/partner.functions.ts               partner-side: get my org,
                                            bulk CSV import
src/lib/admin-partners.functions.ts        admin-side: create org, link
                                            a landlord account to it
src/routes/_authenticated/partner-import.tsx   the CSV upload page
src/routes/_authenticated/verify-identity.tsx  (from the earlier fix —
                                            included in case it wasn't
                                            applied yet)
src/routes/admin/partners.tsx              admin screen: create orgs,
                                            link accounts
supabase/migrations/20260829000000_partner_orgs.sql

FILES CHANGED (7)
-------------------
src/lib/bookings.functions.ts    publishProperty/publishRoom skip the
                                  individual-landlord KYC check when the
                                  property/room has a partner_org_id —
                                  the org itself is vetted once by an
                                  admin instead
src/routes/_authenticated/rooms.tsx        KYC redirect -> /verify-identity
                                            (from the earlier fix, included
                                            in case it wasn't applied yet)
src/routes/_authenticated/properties.tsx   same
src/components/AppShell.tsx      added "Verify Identity" and "Partner
                                  Import" to the landlord sidebar
src/routes/admin.tsx             added "Partners" to the admin sidebar
src/components/MyrShell.tsx      (from the earlier fix, included in case
                                  it wasn't applied yet — Home link fix)

======================================================================
HOW IT WORKS END TO END
======================================================================
1. A society emails/talks to you. You decide to onboard them.
2. Admin -> Partners -> "Create" -> enter the society's name (+ optional
   contact info). This IS the trust/vetting step — same weight as an
   individual landlord's KYC, just done once per organization instead
   of per listing.
3. Someone from the society signs up as a normal landlord at
   /landlord/login (nothing new — same signup everyone already uses).
4. Admin -> Partners -> find the org -> "Link a landlord account" ->
   enter that person's email -> Link. Done, no new auth system.
5. That person now sees "Partner Import" in their RentDesk sidebar.
   They upload a CSV (template download button is right there) with
   columns: property_external_ref_id, property_name, city, address,
   room_external_ref_id, room_number, rent_amount, description,
   amenities (semicolon-separated).
6. Rows land straight in the same `properties`/`rooms` tables RentDesk
   already manages beautifully — is_public/myr_available are set true
   immediately (no separate publish step, no individual KYC check —
   the org-level vetting already covers it). They show up on
   /myr/browse right away.
7. Society updates their own inventory in their own tool -> re-exports
   -> re-uploads the same CSV -> matching rows (by external_ref_id)
   update in place instead of duplicating.

WHY THIS DESIGN (vs. building a whole separate partner portal)
--------------------------------------------------------------------
The partner user just uses RentDesk's EXISTING properties/rooms pages
for everything after the initial import — live-feed video, room edits,
bills if they want them, etc. all already work, because partner rows
are ordinary rows in the same tables with 3 extra metadata columns
(source, partner_org_id, external_ref_id). No duplicate UI to build or
maintain, no parallel data model — the exact mistake the /myr/landlord
cleanup from earlier was fixing.

WHAT PHASE 1 DELIBERATELY DOES NOT INCLUDE (your call for later)
------------------------------------------------------------------
- A REST API for real-time push (Phase 2, if a society's dev team wants
  it) — CSV is the zero-dev-effort starting point, as discussed
- Pre-built connectors for specific tools like MyGate/ADDA (Phase 3,
  once you know which 2-3 tools your target societies actually use)
- A distinct "Verified via {Society Name}" badge on listing cards —
  the data (partner_org_id) is there to support this, just didn't
  touch card UI in this pass to keep the change scoped
- Self-serve org creation/linking by the society (currently admin does
  both steps by hand) — fine at low volume, worth automating later

VERIFIED
--------
- npm run build -> succeeds (client + server), 0 TypeScript errors
- npx eslint    -> 0 errors
- npx prettier  -> formatted
