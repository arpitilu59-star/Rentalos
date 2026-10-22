# RentDesk app — feature parity (web RentDesk vs landlord app)

Legend: ✅ implemented + server-enforced · 🟡 partial · ❌ missing · 🔒 blocked (backend / plan / platform)
"Tests" = covered by automated tests in `src/lib/__tests__` (fake-DB API tests + pure rule tests). Nothing has been run on a physical device.

| Area (web module) | Status | Notes |
|---|---|---|
| Landlord-only login / signup (auth) | ✅ | `l/me` gate; tenant accounts refused; server re-checks on every `l/*` call (tests) |
| Dashboard (rentdesk.tsx) | ✅ | real counts, collected, due/overdue, upcoming 7-day dues, recent notifications, prioritised "Action required" |
| Properties CRUD (properties.tsx) | ✅ | search + Live/Draft/Full filter; GPS location; delete blocked while tenants live |
| Rooms CRUD (rooms.tsx) | ✅ | occupant type, size, rent, capacity; delete blocked while occupied |
| Listing checklist + publish | ✅ | server refuses publish until property, room, deposit, amenities, descriptions, terms, UPI (+ live photo if plan has it) are done (tests); preview card |
| Parking (room form) | ✅ | dedicated/shared/nearby/street/none + vehicle, covered/reserved/paid, distance, notes; street/nearby never shown as landlord-owned (server + DB rule, tests) |
| Rental terms editor (rental-terms.tsx) | ✅ | existing schema + `publish_rental_terms` versioning; required acknowledgement-backed fields enforced; old acceptances untouched |
| Terms version history / acceptance report | ✅ | version list with acceptance counts (read-only, versions immutable) |
| Live photos (camera + GPS 50 m) | ✅ | same rules/limits as web; plan-gated (`live_feed_video`) |
| Booking requests (bookings.tsx) | ✅ | accept (capacity check, tenant code, closes other requests when full) / reject |
| Tenants (tenants.tsx) | ✅ | add/edit, search, Active/Dues/Move-out filters, full-room refusal on add and reassignment (tests) |
| Room compatibility | ✅ | tenant gender; Boys/Girls rooms refuse the wrong gender on add and on reassignment (tests). Needs migration 20261002 |
| Tenant rent/payment history | ✅ | per-tenant statement (billed / paid / due + bills) |
| Move-out workflow (moves.tsx) | ✅ | financial checklist (bills, payment proofs, meter, deposit); unpaid bills need explicit confirm; unverified proofs block (tests) |
| Move-in / move-out records | ✅ | create + history (checklist, meter, notes); photos not uploaded |
| Bills (bills.tsx) | ✅ | generate (server totals, duplicate-period refusal), list, due filter, mark paid, **bill detail screen, PDF download/share (server-built PDF, 24h private link), manual WhatsApp send (opens owner's own WhatsApp with bill text, optional PDF link; never shown as "delivered")** (tests). partial payments (capped at balance), pause reminders, delete only for bills with no payments (tests). Bill edit and "mark pending" deliberately not offered (would corrupt payment ledger); auto reminders run server-side from the web cron |
| Payment verification (payment-verify.tsx) | ✅ | proof image, verify/reject, double-verify refused, owner + plan check (tests) |
| Meters (meters.tsx, meter-ocr) | ✅ | guided property→room→reading; decimals (red digit); lower/high/duplicate/future guards server-side (tests); OCR suggestion only; tenant submissions approve/edit/reject |
| Meter photo location | ✅ | camera photo + GPS stored (optional, validated). Needs migration 20261002 |
| OCR decimals | 🟡 | OCR reads black digits only; user types the red digit |
| Deposits (deposits.tsx) | ✅ | create, settle with deduction + reason, status history (tests) |
| Maintenance (maintenance.tsx) | ✅ | status/priority filters, photos, status update with resolution note |
| Notifications | ✅ | list, unread badge, mark read; tap opens the exact tab/sub-tab from the notification link (meters, verify, bills, deposits, bookings, complaints…) |
| Settings (settings.tsx) | ✅ | profile, UPI, billing default rates |
| Subscription (subscription.tsx) | 🟡 | read-only plan, real entitlements, plans, payment history. Upgrade/payment stays on the website (admin-verified) |
| Identity verification | 🟡 | read-only status; submitting documents stays on the web |
| Partner CSV import | ✅ | paste CSV → dry-run check → import; only for partner-org members with `partner_import` entitlement (tests). No file picker (paste only) |
| WhatsApp link status | 🟡 | read-only (linked / opted-in / live delivery on or off). Linking needs OTP and stays on the website |
| Push notifications | 🔒 | needs EAS build + FCM |
