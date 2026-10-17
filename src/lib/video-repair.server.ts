import { patchWebmDuration } from "./webm-fix";

const MAX_REPAIR_BYTES = 40 * 1024 * 1024;

/** Download a stored WebM, add the missing duration, upload it back. No-op for MP4 / already-fixed files. */
export async function repairStoredVideo(path: string, durationMs: number): Promise<boolean> {
  if (!/\.webm$/i.test(path) || !(durationMs > 0)) return false;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const dl = await supabaseAdmin.storage.from("live-feed-videos").download(path);
  if (dl.error || !dl.data) throw new Error(`download: ${dl.error?.message ?? "empty"}`);
  if (dl.data.size > MAX_REPAIR_BYTES) return false;
  const bytes = new Uint8Array(await dl.data.arrayBuffer());
  const fixed = patchWebmDuration(bytes, durationMs);
  if (fixed === bytes) return false;
  const up = await supabaseAdmin.storage
    .from("live-feed-videos")
    .upload(path, new Blob([fixed as BlobPart], { type: "video/webm" }), {
      upsert: true,
      contentType: "video/webm",
      cacheControl: "31536000",
    });
  if (up.error) throw new Error(`upload: ${up.error.message}`);
  return true;
}
