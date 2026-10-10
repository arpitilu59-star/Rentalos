# WhatsApp (Meta Cloud API) — apply
1. Copy files to the same paths in your repo (src/routeTree.gen.ts regenerates on `npm run dev`/build; included for convenience).
2. `npm i -D vitest` and add script `"test": "vitest run"`.
3. Run supabase/migrations/20260918000000_whatsapp_meta.sql in the Supabase SQL editor.
4. Copy .env.example values you need into Vercel env (server-side only). Without Meta creds everything runs in SIMULATED mode.
5. Meta setup: webhook URL https://rentalos.in/api/whatsapp/webhook, same verify token; subscribe to "messages"; create+approve 2-variable templates; schedule POST /api/whatsapp/dispatch with `Authorization: Bearer $WHATSAPP_DISPATCH_SECRET`.
