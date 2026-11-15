# Frontend contributions

Work from a founder-approved, sanitized development copy of RentalOS. Do not use a production database, production accounts, tenant exports, privileged keys, billing tools or infrastructure commands for frontend work. Ask the founder privately for access to the approved repository and staging/test accounts if needed. A repository invitation does not grant production access.

## Local setup

Install Git and a supported Node.js LTS release (Node 22.12+ or 24) with npm. From the authorized repository root:

```sh
npm ci
git switch -c feature/fe-001-navbar
npm run dev:qa
```

The QA preview is at `http://127.0.0.1:4177`. It renders the actual homepage, browse and RentDesk components using synthetic rooms, names and amounts. `/rentdesk?empty=1` shows the empty state. It loads no environment files, and replaces the Supabase client, entitlements, video API, pricing and WhatsApp panels with local fixtures. **It cannot validate authentication, payments, real search results, video delivery or server behavior.** Other navigation destinations deliberately display a mock destination.

Use the mock preview for screenshots. Do not put real tenant/payment information into fixtures. The standalone preview lives under `scripts/frontend-qa`; it is not a production route.

For an approved staging integration, `npm run dev` starts the regular Vite app. Have the mentor supply a dedicated staging setup through the agreed private channel. Browser-side variable names are `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_SUPABASE_PROJECT_ID`. These are **names only**; this guide supplies no values. Frontend presentation tasks do not require service-role keys, Meta tokens or production environment files. If staging access has not been supplied, continue with mocks and disclose the integration-test limitation.

## Scope and review

- Branch examples: `feature/fe-002-browse-cards`, `fix/fe-004-filter-focus`, `test/fe-007-browse-filters`, `docs/fe-009-contributing`.
- Use focused commits such as `fix: restore mobile menu focus on Escape`.
- Preserve current routes, branding, entitlement indicators, authentication, monetary calculations and listing eligibility rules.
- Keep native apps in `mobile/` and `landlord/`, migrations, server functions, billing and WhatsApp integrations outside the frontend sprint unless the founder explicitly expands scope.
- Push the feature branch and open a PR against `main`. Do not merge or deploy these frontend tasks yourself. Request founder review.
- Report exposed credentials or sensitive findings privately to the founder. Do not paste keys, tenant details or exploit instructions into public issues or screenshots.

## Checks before a PR

```sh
npm run lint
npm run test
npm run build
git diff --check
git status --short
```

The default build targets the repository's Cloudflare preview. Production Vercel validation uses `npx vite build --config vite.config.vercel.ts`; building locally does not deploy. Native video transcoding requires the Node/Vercel runtime. Run commands against your approved development environment only. Report pre-existing lint/build/type failures accurately; do not silently suppress checks or reformat unrelated files.

Manually test 375px, 768px and desktop widths, long labels/large sample INR values, empty results, dark/light modes and browser zoom. Navigate with Tab/Shift+Tab, Enter/Space and Escape; verify focus remains visible and returns from dialogs. Check range sliders with arrow keys, city selection/clearing, filter URL refresh/reset and selected states. Check reduced-motion preference and verify that no horizontal page scroll is introduced. Mouse testing alone does not establish touch-device compatibility.

## PR checklist

- [ ] Linked issue numbers and a concise explanation of observed bugs and resulting behavior.
- [ ] Changed files stay within the approved scope; existing routes and API contracts are preserved.
- [ ] Before/after mobile and desktop screenshots use only synthetic or non-sensitive public data.
- [ ] Manual steps, keyboard checks, widths, empty states and reduced-motion checks are recorded.
- [ ] Lint, tests and build outcomes are included, with existing failures clearly separated.
- [ ] No `.env` files, tokens, service keys, generated builds, private logs or customer data are staged. Review `git diff --cached` before committing.
- [ ] Known limitations and untested integration/device behavior are explicit.

## Shared presentation components

`EmptyState` accepts its existing optional icon/action and required title. It is reused in bills, properties, rooms, tenants and RentDesk. Decorative icons are hidden from assistive technology; actions remain normal focusable controls. `StatCard` retains its existing label/value/icon/accent API and is currently used by RentDesk. Test both at narrow widths with long words and large formatted amounts. Reuse these components when the same pattern fits; avoid mechanical page-wide refactors.
