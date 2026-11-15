import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  VIDEO_BUCKET,
  VIDEO_PROCESSING_ERROR,
  EMPTY_VIDEO_ASSETS,
  type VideoAssets,
  assertOwnedVideoPath,
} from "./video-media";
import { MAX_VIDEO_BYTES } from "./video";

// Client is injected so web, native API, admin review and backfill use the same checks.
export async function processLiveVideo(client: SupabaseClient, id: string, ownerId?: string) {
  const { data: row, error } = await client
    .from("live_feed_videos")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !row || (ownerId && row.owner_id !== ownerId)) throw new Error("Video not found.");
  if (row.processing_status === "ready") return row;
  assertOwnedVideoPath(row.storage_path, row.owner_id);
  if (
    row.processing_status === "processing" &&
    Date.now() - new Date(row.updated_at).getTime() < 5 * 60000
  ) {
    throw new Error("Your video is still processing. Please wait and refresh.");
  }
  const { data: locked, error: lockError } = await client
    .from("live_feed_videos")
    .update({ processing_status: "processing", processing_error: null })
    .eq("id", id)
    .eq("updated_at", row.updated_at)
    .select("id")
    .maybeSingle();
  if (lockError || !locked)
    throw new Error("Your video is still processing. Please wait and refresh.");
  const uploaded: string[] = [];
  try {
    const storage = client.storage.from(VIDEO_BUCKET);
    const { data: blob, error: downloadError } = await storage.download(row.storage_path);
    if (downloadError || !blob)
      throw new Error("Video upload could not be read. Please upload it again.");
    if (blob.size > MAX_VIDEO_BYTES || blob.size < 1000)
      throw new Error("Video file size is not supported.");
    const { transcodeVideo } = await import("./video-transcode.server");
    const result = await transcodeVideo(
      new Uint8Array(await blob.arrayBuffer()),
      row.duration_seconds ?? 0,
    );
    const prefix = `${row.owner_id}/processed/${randomUUID()}`;
    const files = [
      { path: `${prefix}/full.mp4`, bytes: result.full, type: "video/mp4" },
      { path: `${prefix}/preview.mp4`, bytes: result.preview, type: "video/mp4" },
      { path: `${prefix}/poster.jpg`, bytes: result.poster, type: "image/jpeg" },
    ];
    for (const file of files) {
      const { error: uploadError } = await storage.upload(file.path, file.bytes, {
        contentType: file.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) throw new Error("Video processing could not finish. Please try again.");
      uploaded.push(file.path);
    }
    const patch = {
      processing_status: "ready",
      processing_error: null,
      playback_path: files[0].path,
      preview_path: files[1].path,
      poster_path: files[2].path,
      duration_seconds: Math.round(result.duration),
    };
    const { error: saveError } = await client.from("live_feed_videos").update(patch).eq("id", id);
    if (saveError) throw new Error("Video processing could not finish. Please try again.");
    return { ...row, ...patch };
  } catch (error) {
    if (uploaded.length) await client.storage.from(VIDEO_BUCKET).remove(uploaded);
    const message = error instanceof Error ? error.message : VIDEO_PROCESSING_ERROR;
    await client
      .from("live_feed_videos")
      .update({ processing_status: "failed", processing_error: message })
      .eq("id", id);
    throw new Error(message);
  }
}

export async function signVideoAssets(
  client: SupabaseClient,
  row: {
    processing_status: string;
    playback_path: string | null;
    preview_path: string | null;
    poster_path: string | null;
  },
  expires = 21600,
): Promise<VideoAssets> {
  if (row.processing_status !== "ready" || !row.playback_path) return { ...EMPTY_VIDEO_ASSETS };
  const paths = [row.playback_path, row.preview_path, row.poster_path].filter(
    (p): p is string => !!p,
  );
  const { data, error } = await client.storage.from(VIDEO_BUCKET).createSignedUrls(paths, expires);
  if (error) throw new Error("Could not load the video. Please try again.");
  const urls = new Map(data?.map((item) => [item.path, item.signedUrl]));
  const url = urls.get(row.playback_path) || null;
  if (!url) throw new Error("Could not load the video. Please try again.");
  return {
    url,
    previewUrl: urls.get(row.preview_path ?? "") || null,
    posterUrl: urls.get(row.poster_path ?? "") || null,
  };
}
