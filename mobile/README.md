# Rentalos app (Expo / React Native)

Tenant app — Home, Explore, Roommates (chat + video call), Inbox, Profile.
Backend = same Supabase project + `/api/app/*` on www.rentalos.in.

## Chalane ke steps (PC par)
1. `cd mobile && npm install --legacy-peer-deps`
2. `.env.example` ko `.env` naam se copy karein (anon key public hai, website wali hi).
3. Phone par **Expo Go** install karein, phir `npx expo start` — QR scan karein.
   (Push notification ke liye Expo Go me limited; asli test development build me.)
4. Play Store build: `npm i -g eas-cli && eas login && eas build:configure && eas build -p android --profile production`.

## Backend (website repo) me pehle ye ho
- Supabase me `supabase/migrations/20260928000000_mobile_push.sql` chalayein.
- Website deploy ho jaye (naya `/api/app/*`), warna Home/Roommates/Chat kaam nahi karenge.
- GitHub Actions `push-dispatch.yml` har 5 min me pending push bhejta hai.
