/**
 * Room-video helpers (video-first marketplace).
 *
 * Rule: the landlord records/uploads ONE full room video. Listing cards play
 * only the first PREVIEW_SECONDS of that same file (no second upload needed);
 * the room detail page plays the complete video.
 */

export const PREVIEW_SECONDS = 5;

/** Same limits the server enforces in submitLiveVideo (5–45 s). */
export const MIN_VIDEO_SECONDS = 5;
export const MAX_VIDEO_SECONDS = 45;
export const MAX_VIDEO_BYTES = 120 * 1024 * 1024; // 120 MB
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export type VideoCheck = { ok: true } | { ok: false; message: string };

/** Human-readable validation — never expose raw codes like MEDIA_PROCESSING_ERROR. */
export function validateRoomVideo(input: {
  type?: string;
  sizeBytes?: number;
  durationSeconds?: number;
}): VideoCheck {
  const { type, sizeBytes, durationSeconds } = input;
  if (type && !ACCEPTED_VIDEO_TYPES.some((t) => type.startsWith(t.split(";")[0]))) {
    return { ok: false, message: "This video format isn't supported. Please use an MP4 video." };
  }
  if (sizeBytes != null && sizeBytes > MAX_VIDEO_BYTES) {
    return {
      ok: false,
      message: `This video is larger than ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)} MB. Please record a shorter clip.`,
    };
  }
  if (durationSeconds != null && durationSeconds < MIN_VIDEO_SECONDS) {
    return {
      ok: false,
      message: `Please record at least ${MIN_VIDEO_SECONDS} seconds so tenants can see the room.`,
    };
  }
  if (durationSeconds != null && durationSeconds > MAX_VIDEO_SECONDS) {
    return {
      ok: false,
      message: `Videos can be up to ${MAX_VIDEO_SECONDS} seconds. Please record a shorter walkthrough.`,
    };
  }
  return { ok: true };
}

/** Turn any thrown value into a calm, actionable video message. */
export function friendlyVideoError(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e ?? "");
  if (/duration/i.test(raw)) return raw;
  if (/forbidden|not yours|not found/i.test(raw))
    return "We couldn't find this room under your account. Please refresh and try again.";
  if (/network|fetch|failed to load/i.test(raw))
    return "We couldn't upload this video. Check your connection and try again.";
  return "We couldn't process this video. Please try another MP4 video.";
}

export function formatClock(s: number): string {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
