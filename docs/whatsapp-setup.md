# Rentalos WhatsApp setup

Website, RentalOS and RentDesk share the same Supabase data and server. Their
notifications are forwarded by `/api/whatsapp/dispatch`; no Meta credential belongs
in either APK. The existing manual WhatsApp buttons still open the owner's app.

## Server configuration

Use `.env.example` for variable names. Store actual secrets in the ignored local
`.env.local` and in the hosting project's server environment. Never commit them.

| Variable | Value |
| --- | --- |
| `META_WHATSAPP_ACCESS_TOKEN` | Token with WhatsApp messaging access to the sender account |
| `META_WHATSAPP_PHONE_NUMBER_ID` | The sender's Phone Number ID, not its phone digits |
| `META_GRAPH_API_VERSION` | `v25.0` (the version shown by this app's Meta testing screen) |
| `META_TEMPLATE_LANGUAGE` | Exact approved template locale, default `en_US` |
| `META_WHATSAPP_AUTH_TEMPLATE` | Approved copy-code authentication template, e.g. `rentalos_verify_code` |
| `META_WHATSAPP_VERIFY_TOKEN` | Random webhook verification secret |
| `META_APP_SECRET` | Rentalos Meta app secret, used to validate webhook signatures |
| `WHATSAPP_DISPATCH_SECRET` | A different random secret, matching the GitHub Actions secret |

## Test first, then production

The Meta test sender can message only recipients verified in the Meta dashboard.
Its temporary token is for testing. Sending a sample template successfully does
not make the production reminder templates available. Use a registered business
sender and suitable system-user token for ongoing automation.

1. Add and verify your own recipient in Meta's **Step 1. Try it out**.
2. Send one sample message; confirm it arrives on WhatsApp.
3. Register the intended production business number. Do not migrate an existing
   WhatsApp Business app number without checking coexistence and ownership.
4. Submit the templates in `whatsapp-templates.json` and wait for approval. The
   utility templates take two body variables: headline and details. Template names
   can be overridden by `META_TEMPLATE_<EVENT>`; see `src/lib/whatsapp/templates.ts`.
5. Configure the server variables and redeploy. Do not put the temporary test
   credential in a production scheduler that targets real customers.
6. In Meta, set callback URL `https://www.rentalos.in/api/whatsapp/webhook`, enter
   the matching verify token, verify/save, and subscribe the `messages` field.
   Complete Meta's publishing requirements before relying on production webhooks.
7. Set GitHub Actions secret `WHATSAPP_DISPATCH_SECRET` to match the server. The
   existing workflow runs every 10 minutes; GitHub may delay scheduled runs.
8. Each recipient opens website **Settings > WhatsApp updates**, verifies their
   number and enables updates. Merely having a tenant phone number in the database
   does not opt that person in or prove ownership.
9. Trigger one eligible notification for the verified test account. Review
   `/admin/whatsapp` and the delivery webhook: API acceptance is not proof that the
   recipient received the message.

## Checks

- Webhook GET returns the challenge only for the matching verification secret.
- Webhook POST rejects invalid `X-Hub-Signature-256` signatures.
- Dispatch requires its bearer secret; missing Meta configuration consumes no
  notification slots and sends nothing.
- Verification uses an authentication template, including its copy-code button.
  Plain text cannot initiate a first-time WhatsApp verification conversation.
- Run `npx vitest run src/lib/whatsapp/_tests_ --config vite.config.vercel.ts`.

Existing scheduled notifications cover bills, payments, maintenance, bookings,
lease expiry, verification and subscriptions. No automatic bulk send is needed
to test connectivity.
