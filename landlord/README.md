# RentDesk (landlord app)

Landlord-only Expo app (SDK 57). Same Supabase + `/api/app/l/*` backend as Rentalos.

```
cd landlord
cp .env.example .env     # Supabase URL/anon key + EXPO_PUBLIC_API_URL
npm install
npx expo start           # open in Expo Go
```

Tabs: Home · Rooms · Requests (bookings + complaints) · Tenants · Money (bills, payment verify, meter approve).

- Sign-up creates a landlord account; sign-in refuses tenant accounts.
- A room cannot be published until the checklist is complete (property details + map location, room profile, deposit,
  amenities, descriptions, rental terms, UPI ID and — if the plan includes it — a live photo). The server enforces this too.
- Photos are camera-only and GPS-checked (within 50 m of the property).

## Android: install, run, test

```bash
cd landlord
cp .env.example .env          # EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_API_URL
npm install
npx expo-doctor               # needs internet (exp.host)
npm run typecheck
npx expo start --android      # or scan the QR code in Expo Go
npx expo export --platform android --output-dir /tmp/rentdesk-out   # bundling check
```

Server-side tests (repo root): `npm test`. Server env used by the app API: existing Supabase keys; `LOVABLE_API_KEY` only for meter OCR.
See `FEATURE_PARITY.md` for what is done / partial / blocked.
