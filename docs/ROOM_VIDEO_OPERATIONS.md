# Room video processing

A single private original produces a full H.264/AAC MP4, a silent five-second MP4 preview, and a JPEG poster. Original objects and verification decisions are preserved. The public web and app endpoints select only verified, unexpired recordings with processing_status=ready.

## Deployment order

1. Apply supabase/migrations/20261114000000_video_processing.sql. This migration is additive. Never run unrelated pending migrations as part of this rollout.
2. Supply SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY through the operator's local environment. Never commit credentials.
3. Run npm run video:process to inspect the pending list without changes.
4. Run npm run video:process -- --apply --configure-bucket to enable private JPEG poster storage and process existing recordings. Specific recording UUIDs may be supplied to limit the batch. Failed recordings remain stored and display a replacement message to their owner. Do not change their verification decisions or publish private rooms.
5. Build/deploy with vite.config.vercel.ts. Nitro explicitly traces ffmpeg-static into a Node.js Vercel function and sets a 300-second request limit. Build on the target OS: Windows output must not be deployed to Linux as prebuilt.
6. Confirm the production full-video URL, preview URL and poster load, the card loops, the full player seeks and has audio, and failed loads retain Retry.
7. Native frontend changes require a new RentalOS/RentDesk APK; backend asset compatibility improvements also serve already-installed clients.

## New recordings

Both website and landlord-app registration routes call the same server processor. Admin approval first requires successful processing. Validation decodes the entire recording; corrupt or incomplete streams are rejected. Processing uses private temporary files, bounded encoder execution and restricted input protocols. Output paths are unique, preventing stale cached replacements.

## Tests

npm test runs the offline suite with bounded concurrency for the local Postgres tests. Native checks: npm run typecheck in mobile/ and landlord/. ffmpeg-static is installed for the current platform, so decoder tests need no global FFmpeg installation.

Originals are retained for review/recovery. To retry a transient processing failure, an authorized operator can run the same command with --apply and the recording UUID. A damaged original needs a new recording. The script does not re-verify content or extend expiry dates.
