# Deploy: अपना Supabase + अपना domain (GitHub → Vercel)

## 1. Supabase migrate करें

`supabase-migration/README.md` follow करें (schema SQL, users import, data CSVs)।
वो folder Documents में है — download कर लें।

## 2. Keys

App इन environment variables से चलती है:

| Variable | कहाँ से मिलेगा | किसके लिए |
|---|---|---|
| `VITE_SUPABASE_URL` | Project URL | browser |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | anon / publishable key | browser |
| `VITE_SUPABASE_PROJECT_ID` | project ref (URL का subdomain) | browser |
| `SUPABASE_URL` | वही Project URL | server |
| `SUPABASE_PUBLISHABLE_KEY` | वही anon key | server |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (**secret**) | server functions |
| `RESEND_API_KEY` | resend.com | email receipts |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_WHATSAPP_FROM` | twilio.com | WhatsApp bill |
| `LOVABLE_API_KEY` | ⚠️ Vercel पर काम नहीं करेगा | meter OCR (AI) |

**LOVABLE_API_KEY के बारे में:** meter photo OCR Lovable AI Gateway से चलता है, जो सिर्फ़
Lovable hosting पर valid है। Vercel पर वो feature बंद रहेगा जब तक आप `src/lib/ai-gateway.ts`
में अपनी OpenAI/Gemini key न लगा दें। बाकी सब features (bills, PDF, UPI, bookings, MYR,
live feed, admin) पूरी तरह चलेंगे।

## 3. GitHub → Vercel

1. Lovable में **GitHub → Connect** करके repo export करें।
2. Vercel → **New Project** → वही repo import करें।
3. Framework Preset: **Other** (repo का `vercel.json` build command खुद उठा लेगा)।
4. Environment Variables में ऊपर वाली सारी keys डालें (Production + Preview दोनों)।
5. Deploy।

`vercel.json` पहले से मौजूद है:

```json
{
  "buildCommand": "vite build --config vite.config.vercel.ts",
  "outputDirectory": ".output/public"
}
```

`vite.config.vercel.ts` भी बना दिया है — यह Cloudflare Workers की जगह Vercel का nitro
preset use करता है। Lovable का अपना preview पुराने `vite.config.ts` से चलता रहेगा, कुछ टूटेगा नहीं।

अगर build में Cloudflare plugin से error आए, तो `vite.config.vercel.ts` में
`@lovable.dev/vite-tanstack-config` की जगह plain TanStack Start plugins use करें —
वो fallback भी उसी file के comments में लिखा है।

## 4. Custom domain

Vercel → Project → Settings → **Domains** → अपना domain add करें → registrar पर
Vercel के दिए CNAME/A records लगा दें।

फिर Supabase Dashboard → Authentication → URL Configuration में:
- **Site URL**: `https://yourdomain.com`
- **Redirect URLs**: `https://yourdomain.com/**`

वरना login के बाद redirect टूटेगा।

## 5. Cron (bill reminders)

पुराने project में `pg_cron` से `cron_bill_reminders()` रोज़ चलता था। नए project में
SQL Editor में एक बार चलाएँ:

```sql
create extension if not exists pg_cron;
select cron.schedule('bill-reminders', '0 9 * * *', $$select public.cron_bill_reminders()$$);
```
