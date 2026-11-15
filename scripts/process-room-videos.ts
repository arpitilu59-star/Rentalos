/** Explicit maintenance command. Dry-run by default; originals and review decisions are preserved. */
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { createClient } from "@supabase/supabase-js";
import { processLiveVideo } from "../src/lib/video-processing.server";

for (const file of [".env", ".env.local"]) {
  try {
    for (const [key, value] of Object.entries(parseEnv(readFileSync(file, "utf8"))))
      process.env[key] ??= value;
  } catch {
    /* Environment variables may already be supplied by the operator. */
  }
}
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY)
  throw new Error("Server credentials must be supplied locally.");
const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const apply = process.argv.includes("--apply");
if (process.argv.includes("--configure-bucket")) {
  if (!apply) throw new Error("--configure-bucket requires --apply.");
  const { data: bucket, error } = await client.storage.getBucket("live-feed-videos");
  if (error || !bucket) throw new Error("Could not read video storage settings.");
  if (bucket.allowed_mime_types && !bucket.allowed_mime_types.includes("image/jpeg")) {
    const { error: updateError } = await client.storage.updateBucket("live-feed-videos", {
      public: bucket.public,
      allowedMimeTypes: [...bucket.allowed_mime_types, "image/jpeg"],
    });
    if (updateError) throw updateError;
  }
}

const ids = process.argv.filter((arg) => /^[0-9a-f-]{36}$/i.test(arg));
let query = client
  .from("live_feed_videos")
  .select("id,processing_status")
  .order("created_at", { ascending: true })
  .limit(100);
if (ids.length) query = query.in("id", ids);
const { data, error } = await query;
if (error) throw error;
for (const row of data ?? []) {
  if (!apply || row.processing_status === "ready") {
    console.log(
      JSON.stringify({
        id: row.id,
        status: row.processing_status,
        action: apply ? "already ready" : "dry run",
      }),
    );
    continue;
  }
  try {
    const processed = await processLiveVideo(client, row.id);
    console.log(
      JSON.stringify({
        id: row.id,
        status: processed.processing_status,
        duration: processed.duration_seconds,
      }),
    );
  } catch (error) {
    console.log(
      JSON.stringify({
        id: row.id,
        status: "failed",
        message: error instanceof Error ? error.message : "Processing failed",
      }),
    );
    process.exitCode = 1;
  }
}
