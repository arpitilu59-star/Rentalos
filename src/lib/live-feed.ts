import { supabase } from "@/integrations/supabase/client";

export const LIVE_PROMPTS: string[] = [
  "Show the switch board",
  "Hold up 2 fingers",
  "Point to the ceiling fan",
  "Show the main door",
  "Tap the window glass",
  "Show today's newspaper",
];

/** Pick a random prompt: either from list or a random 4-digit code. */
export function pickRandomPrompt(): string {
  if (Math.random() < 0.5) {
    return LIVE_PROMPTS[Math.floor(Math.random() * LIVE_PROMPTS.length)];
  }
  const code = Math.floor(1000 + Math.random() * 9000);
  return `Say the code: ${code}`;
}

export function currentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("Geolocation not supported"));
    navigator.geolocation.getCurrentPosition(resolve, (e) => reject(new Error(e.message)), {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 0,
    });
  });
}

async function uploadWithRetry(
  bucket: string,
  path: string,
  blob: Blob,
  contentType: string,
  attempts = 3,
): Promise<void> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, blob, { contentType, upsert: false, cacheControl: "31536000" });
    if (!error) return;
    // The file may have landed even though the response was lost — treat "already exists" as success.
    if (/already exists|duplicate/i.test(error.message)) return;
    last = error;
    await new Promise((r) => setTimeout(r, 600 * 2 ** i));
  }
  throw last instanceof Error ? last : new Error("Upload failed");
}

export async function uploadRecordedBlob(userId: string, blob: Blob, ext = "webm"): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  await uploadWithRetry("live-feed-videos", path, blob, blob.type || (ext === "mp4" ? "video/mp4" : "video/webm"));
  return path;
}

export async function uploadLivePhoto(userId: string, blob: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  await uploadWithRetry("live-feed-photos", path, blob, "image/jpeg");
  return path;
}

/** Prefer MP4/H.264 (plays everywhere, seekable) and fall back to WebM only where MP4 recording isn't supported. */
export function pickRecorderMime(): string {
  if (typeof MediaRecorder === "undefined") return "video/webm";
  const options = [
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm",
  ];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) ?? "video/webm";
}
