/** Shared media contract. Originals stay private; only validated derivatives are played. */
export const VIDEO_BUCKET = "live-feed-videos";
export const VIDEO_PROCESSING_ERROR =
  "This recording is damaged or incomplete. Please record and upload it again.";
export type VideoAssets = {
  url: string | null;
  previewUrl: string | null;
  posterUrl: string | null;
};
export const EMPTY_VIDEO_ASSETS: VideoAssets = { url: null, previewUrl: null, posterUrl: null };

export function assertOwnedVideoPath(path: string, ownerId: string) {
  if (
    !path.startsWith(`${ownerId}/`) ||
    !/^[0-9a-f-]{36}\/[\w-]{6,80}\.(mp4|mov|webm)$/i.test(path)
  ) {
    throw new Error("Invalid video path.");
  }
}

export function mediaPaths(row: {
  storage_path: string;
  playback_path?: string | null;
  preview_path?: string | null;
  poster_path?: string | null;
}) {
  return [row.storage_path, row.playback_path, row.preview_path, row.poster_path].filter(
    (p): p is string => !!p,
  );
}
