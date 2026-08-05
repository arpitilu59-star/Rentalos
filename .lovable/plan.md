
# RentDesk + MYR — Final Architecture Plan

Aap ka goal: 3 saaf-suthre products, ek dusre se sirf **database ke through synced**, koi combined UI nahi.

## 1. Final Product Map (only 3 surfaces)

```
                        ┌──────────────────────┐
                        │        MYR           │  ← public, no login
                        │  /myr, /myr/browse   │
                        │  /myr/listing/:id    │
                        └────────┬─────────────┘
                                 │  "Book now"
                                 ▼
                        ┌──────────────────────┐
                        │   Tenant App         │  ← only tenant
                        │  /tenant, /tenant/*  │
                        │  own login (email/   │
                        │  mobile) + own dash  │
                        └────────┬─────────────┘
                                 │ booking request
                                 ▼
                        ┌──────────────────────┐
                        │   RentDesk           │  ← only landlord
                        │  /rentdesk, /bills,  │
                        │  /rooms, /tenants,   │
                        │  /properties + NEW   │
                        │  MYR Listings tab    │
                        └──────────────────────┘

Admin (support): /admin/* — verifies property docs, KYC, subscriptions
```

**Removed / merged:**
- `/myr/landlord/*` (separate landlord dash) → merged into RentDesk as a **"MYR Listings"** tab on each Property/Room card.
- `/myr/onboard` role picker → gone. MYR header shows only **"List your property"** → warning popup → `/login` (landlord) → `/rentdesk`.
- Duplicate tenant routes consolidated to one shell.

## 2. Entry-point Routing (per-device stickiness)

On `/` (root):
- If logged in as **landlord** → redirect `/rentdesk`
- If logged in as **tenant** → redirect `/tenant`
- If logged in as **admin** → redirect `/admin`
- Else → redirect `/myr`

Installed PWA (rentdesk app) uses same logic — user jahaan pehle login kiya, wahi khulega.

## 3. Listing Source of Truth (fixes MYR-not-showing bug)

Ek hi source: **RentDesk `properties` + `rooms`**. No parallel MYR listing tables for content.

Schema changes:
- `properties`: add `is_public_listing bool default false`, `myr_city`, `myr_address`, `myr_description`, `myr_cover_photos jsonb`
- `rooms`: add `is_public bool default false`, `myr_photos jsonb`, `myr_amenities text[]`, `myr_available bool default true`

RentDesk Property page pe new **"MYR Listings"** section:
- Toggle "Publish on MYR" per room
- Upload MYR photos, set rent (already there), amenities
- Requires: property docs verified by admin + active subscription

MYR `/myr/browse` queries `rooms` where `is_public = true AND property.verified = true`. Old `myr_listings` table becomes read-only legacy; new flow bypasses it.

## 4. Tenant Flow (separate app, separate login)

```
MYR browse → Room detail → "Book Now"
    → /tenant/login (own page, own branding)
    → tenant signup (email OR mobile + OTP)
    → creates row in `tenants_app_users` (separate from landlord's `tenants` table)
    → /tenant dashboard
    → Booking request created (status=pending)
    → Landlord accepts in RentDesk → status=accepted
    → Landlord ke `tenants` table me auto-linked by mobile no.
    → Tenant sees "Room confirmed" + Bills tab active
```

Tenant dashboard tabs (single shell, `/tenant/*`):
Overview · Room · Rent (UPI pay) · Bills history · Meter reading · Maintenance · Documents · Notifications · Profile · Logout

## 5. UPI-only Payment (no gateway)

- Landlord profile me: `upi_id`, `upi_qr_url` (upload)
- Tenant Bills → "Pay now" → shows QR + UPI ID + amount + note = bill_id
- Tenant uploads screenshot (optional) → `payments` table `verification_status=pending`
- Landlord RentDesk me "Verify payment" → marks paid → bill closed
- No Razorpay/Stripe

## 6. Permanent Billing History

- `bills` table: add `archived bool default false` (never delete), `pdf_path`, `month`, `year`
- Auto-generate: rent bill on move-in, monthly on 1st via cron, **move-out bill** when landlord clicks "Move out" on tenant
- Filters (both landlord + tenant view): Month, Year, Paid/Pending
- Cron: TanStack server route `/api/public/cron/monthly-bills` (secured with secret)

## 7. Subscription (UPI-based)

- `subscriptions` table: `landlord_id`, `plan` (free/pro), `status`, `started_at`, `expires_at`, `upi_ref`
- Landlord Settings → "Upgrade" → shows your UPI QR + amount → landlord pays → uploads ref → admin verifies → activates
- Gating: free = 1 property / 3 rooms / no MYR listing. Pro = unlimited + MYR publish enabled

## 8. Admin (support) Dashboard

Existing `/admin/*` — wire up:
- **Property Verification** (new): review property docs uploaded by landlord in RentDesk, approve/reject → sets `properties.verified`
- **KYC**: already exists (`myr-verifications`) — keep
- **Subscriptions**: verify UPI screenshots, activate plans
- **Users / Fraud / Audits**: keep existing

Landlord ke app me verification form **hatana** — sirf upload rahega, decision admin karega.

## 9. Sidebar (hamburger, not bottom nav)

- All 3 apps: top-left ☰ button → slide-in `Sheet` sidebar
- Bottom nav removed
- Mobile-first, same pattern in MYR / Tenant / RentDesk

## 10. Move-in / Move-out Bill + Tenant ID

- When landlord assigns tenant to room: auto-generate **Tenant ID** (`TID-YYYYMM-XXXX`), auto-create move-in bill (deposit + first rent)
- On "Move out" button: auto-generate **move-out bill** (dues + refundable deposit calculation)

---

## Execution order (this turn + next)

**Turn 1 (now, after your OK):**
1. DB migration: `is_public_listing` fields, `subscriptions`, `payments.verification_status`, `bills.archived/month/year`, tenant-landlord auto-link function
2. Entry-point router on `/`
3. MYR browse: read from `rooms.is_public=true` (fixes not-showing bug)
4. RentDesk Property page: "MYR Listings" tab with per-room publish toggle
5. Delete `/myr/landlord/*` sidebar, keep only "List your property" popup on MYR header
6. Hamburger sidebar across all 3 shells

**Turn 2:**
7. Tenant separate login + booking flow + auto-link by mobile
8. UPI QR payment + screenshot upload + landlord verify
9. Permanent billing history + filters + cron
10. Subscription UPI flow + gating
11. Admin property doc verification + subscription approvals
12. Move-in/out auto-bill + Tenant ID generation

---

## Confirmation needed

1. **Old `myr_listings` data** — keep as-is (read-only legacy) or migrate into `rooms.is_public`? I recommend keep + hide, migrate later.
2. **Tenant login** — same `auth.users` table (with `role=tenant`) or fully separate? I recommend same table + role (simpler, still separate UI).
3. **Free plan limits** — 1 property / 3 rooms OK, or different?
4. **Your UPI ID + QR** for subscription payments — share now ya baad me settings me daaloge?

Aap ke jawab ke baad Turn 1 shuru karta hoon.
