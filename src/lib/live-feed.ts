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

export async function uploadRecordedBlob(userId: string, blob: Blob, ext = "webm"): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("live-feed-videos")
    .upload(path, blob, { contentType: blob.type || "video/webm", upsert: false });
  if (error) throw error;
  return path;
}
