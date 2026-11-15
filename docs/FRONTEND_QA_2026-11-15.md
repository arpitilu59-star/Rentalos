# Frontend issues #1–#9 — QA record

Tested on 15 November 2026 using the actual components in the credential-free `npm run dev:qa` fixture. All landlord names, phone numbers, rooms, bills and amounts in screenshots are synthetic. The before fixture uses the source before this frontend change. Dark and light views are both represented.

## Changes mapped to issues

| Issue | Observed problem and change                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| #1    | Escape left mobile-menu focus on the document; the landlord warning allowed Tab to escape. Added trigger-focus restoration and the existing Radix dialog. The desktop menu now waits for enough width, and the mobile menu scrolls on short screens. Existing routes, branding and warning text are retained.                                                |
| #2    | Long property/location names were truncated beside prices. Cards now wrap names and put price on its own line, retain media fallback and expose a visible keyboard focus ring. Queries and booking navigation are unchanged.                                                                                                                                 |
| #3    | Synthetic large amounts and tenant text overflowed the 375px baseline dashboard. Stats/activity grids now allow sufficient width; rows wrap, search has a name and a full-width option, and empty search/empty account messages differ. Database queries and money calculations are unchanged.                                                               |
| #4    | City clearing used a nested pseudo-button without keyboard behavior; city popover lacked focus handling. Reused Radix popover, added a separate clear button, named budget/search controls, exposed chip selection and enlarged targets. Clamped slider draft values to the existing bounds. URL parsing, query limits and matching semantics are unchanged. |
| #5    | Homepage lacked a main landmark/skip link; auxiliary CTAs were small, large compact-card prices could collide with `/month`, and decorative CSS hover/loading animations ignored reduced motion. Added targeted landmark, wrapping, target and motion-safe styling. SEO, copy and video behavior are preserved.                                              |
| #6    | Mobile theme/account icons lacked names; profile dropdown lacked keyboard dismissal, and active links lacked current-page semantics. Reused the shared dropdown and added names, focus rings, touch targets, active states and the existing entitlement indicator on mobile. Theme storage, logout and permission checks are unchanged.                      |
| #7    | Added nine offline helper scenarios: blank versus zero, malformed scalar types/non-finite values, fractional/end-point rent, unsupported enums, strict facility booleans, term bounds, Unicode URL round trip, counts/paging, and wildcard/backslash safety.                                                                                                 |
| #8    | Shared stat/empty components now wrap long text and amounts, keep decorative icons hidden from assistive technology and preserve their existing props. Reuse locations are documented.                                                                                                                                                                       |
| #9    | Added contributor setup, a no-credentials mock preview, staging-access limitations, branch/PR rules, QA commands and a PR/security checklist in `FRONTEND_CONTRIBUTING.md`. README/DEPLOY are unchanged.                                                                                                                                                     |

## Manual results

- Homepage, browse and mock RentDesk: no horizontal document overflow at **375, 768 and 1280px**. Actual viewport width was read back for every final capture. The homepage navbar also passed 1024px.
- Mobile menu Escape returns focus to Open menu. The landlord dialog traps Tab and Escape returns focus to its trigger; navigation destinations/warning text remain the existing ones.
- City picker opens and selects with Enter. Named rent controls respond to arrows. City + budget survive URL refresh. Clear all resets the URL. Facility chips expose `aria-pressed`; drawer closes through Show results/Escape.
- Slider at the upper boundary remains within 0–50,000 after arrow changes.
- Account dropdown responds to Enter/Escape; tenant search distinguishes no matches from an empty account. Theme toggle renders both modes and retains the existing persistence logic.
- The default mock cards intentionally have no media. This fixture does not test storage, authentication, database query results, billing, WhatsApp, or real video playback.
- Reduced-motion JavaScript handling was retained and CSS animations use `motion-safe`. The browser preference was **not enabled** during this run; a physical-device/reduced-motion visual check remains a review item. Mouse/keyboard at a mobile viewport is not a physical touch-device test.

## Automated checks

- 293 tests verified: 287 passed in the isolated full run, then the six mobile-i18n tests passed after its missing Expo development dependencies were made available. Nine browse-boundary cases and the separate signed-video focus regression are included in the total.
- ESLint on every changed frontend TypeScript/TSX file and the mock fixture: **pass**.
- `npm run build`: **pass**. The default target is the existing Cloudflare preview; production video transcoding uses Vercel/Node.
- `git diff --check`: **pass**.
- Root `npx tsc --noEmit` still reports 47 existing diagnostics, mainly stale generated Supabase table/RPC types in admin, partner and roommate modules. None are in the changed frontend components/routes. Native app typechecks passed for the video build.
- Repository-wide lint still fails on pre-existing source formatting/type rules. With generated Vercel/Wrangler/Nitro/TanStack output excluded, this Windows worktree reports **52,620 errors and 32 warnings**; the same configuration on the pre-frontend baseline reports **54,443 errors and 32 warnings**. Counts are sensitive to checkout line endings. No unrelated repository-wide auto-fix was run.

## Screenshots

| Page     | Before mobile                                   | After mobile                                   | Before desktop                                    | After desktop                                    |
| -------- | ----------------------------------------------- | ---------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| Home     | [375px](qa/2026-11-15/home-before-375.jpg)      | [375px](qa/2026-11-15/home-after-375.jpg)      | [1280px](qa/2026-11-15/home-before-1280.jpg)      | [1280px](qa/2026-11-15/home-after-1280.jpg)      |
| Browse   | [375px](qa/2026-11-15/browse-before-375.jpg)    | [375px](qa/2026-11-15/browse-after-375.jpg)    | [1280px](qa/2026-11-15/browse-before-1280.jpg)    | [1280px](qa/2026-11-15/browse-after-1280.jpg)    |
| RentDesk | [375px](qa/2026-11-15/dashboard-before-375.jpg) | [375px](qa/2026-11-15/dashboard-after-375.jpg) | [1280px](qa/2026-11-15/dashboard-before-1280.jpg) | [1280px](qa/2026-11-15/dashboard-after-1280.jpg) |

Additional captures: [tablet home](qa/2026-11-15/home-after-768.jpg), [tablet browse](qa/2026-11-15/browse-after-768.jpg), [tablet dashboard](qa/2026-11-15/dashboard-after-768.jpg), [dialog](qa/2026-11-15/navbar-dialog-after-375.jpg), [empty dashboard](qa/2026-11-15/dashboard-empty-after-375.jpg), [dark dashboard](qa/2026-11-15/dashboard-after-375-dark.jpg).

These frontend issues require a feature branch and PR review. This change does not deploy or merge the frontend branch. Video deployment was a separately authorized repair.
