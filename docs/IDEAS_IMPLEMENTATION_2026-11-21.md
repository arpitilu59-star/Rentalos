# RentalOS ideas, premium UI and support implementation

User-authorized scope: implement the supplied ideas summary, use the navy/gold/off-white reference across website and both apps, replace support contacts with +91 9252199283 and support@rentalos.in, and deliver submitted queries to the Zoho mailbox.

## Decisions

- Reuse existing booking offer columns and private room_offer_settings instead of adding a competing source of negotiated rent. Existing tenancies must not be repriced.
- Room views are deduplicated per viewer, room and India calendar day. Anonymous visitors use a signed first-party cookie; only HMAC keys are stored. Cookie deletion or multiple devices cannot be perfectly deduplicated. Label these daily unique views, not verified people or physical visits.
- Landlords receive aggregate counts only. Raw engagement rows are private and retained for 90 days. New tables have RLS and service-only writes; summaries and stronger signals use the existing notification infrastructure.
- Approvals hold one offer per room for 24 hours. Tenant confirmation creates the tenancy and immutable negotiated-rent confirmation in one transaction. The agreed amount overrides client-supplied amounts; no payment gateway is added.
- Support recipient is fixed. The requester's email is Reply-To, never the SMTP sender. Email acceptance is not proof of inbox delivery; verify a real query in Zoho. Query records have a 180-day retention period. No automated offer/analytics emails are introduced.
- The user's original checkout has many existing uncommitted edits. It is preserved; implementation is on feat/insights-premium-support in an isolated worktree.

## Visual system

Navy #111B3D; warm gold #B4945B; light gold #E7D4B0; off-white #F7F9FB. Emerald denotes collected/positive amounts, amber pending amounts, red urgent actions. Rounded cards, restrained shadows, legible typography, 44px minimum targets and explicit empty/error/loading states. Dark mode preserves hierarchy and readable contrast.

## Verification and operations

Four additive migrations introduced offers, engagement, support and portfolio totals. A fifth protects monthly bill rent for negotiated tenancies. The test suite covers two landlords and two tenants, expiry, competing offers, confirmation rollback, deduplication and portfolio totals. Staff can review unusual view and offer counts at /admin/fraud. The room_insight_rollout table supports specific pilot owners and a global switch.

The deployed support form sent the approved test query to support@rentalos.in on 22 November 2026. Its subject appeared in the Zoho inbox. SMTP credentials and the visitor hash secret are stored as sensitive server variables in Vercel.

Web and Android share the public support endpoint and booking rules. APK users need the new build for the redesigned screens. Production WhatsApp delivery still depends on a registered Meta sender, approved templates and recipient opt-in.
