import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAdmin } from "./fake-admin";
import { processLiveVideo, signVideoAssets } from "../video-processing.server";
const transcode = vi.hoisted(() => vi.fn());
vi.mock("../video-transcode.server", () => ({ transcodeVideo: transcode }));
const owner = "11111111-1111-4111-8111-111111111111";
const row = () => ({
  id: "video-id",
  owner_id: owner,
  storage_path: `${owner}/original.webm`,
  processing_status: "pending",
  updated_at: "2026-01-01",
  duration_seconds: 15,
  verification_status: "pending",
});
beforeEach(() =>
  transcode
    .mockReset()
    .mockResolvedValue({
      full: Buffer.from("full"),
      preview: Buffer.from("preview"),
      poster: Buffer.from("poster"),
      duration: 15,
    }),
);
function setup() {
  const db = { live_feed_videos: [row()] };
  const upload = vi.fn().mockResolvedValue({ error: null });
  const remove = vi.fn().mockResolvedValue({ error: null });
  const client = {
    ...makeAdmin(db),
    storage: {
      from: () => ({
        download: async () => ({ data: new Blob([new Uint8Array(1001)]), error: null }),
        upload,
        remove,
      }),
    },
  };
  return { db, client: client as never, upload, remove };
}
describe("shared website/native video processing", () => {
  it("publishes derivatives atomically, preserves original/verification and ignores already-ready work", async () => {
    const { db, client, upload } = setup();
    const result = await processLiveVideo(client, "video-id", owner);
    expect(result.processing_status).toBe("ready");
    expect(upload).toHaveBeenCalledTimes(3);
    expect(db.live_feed_videos[0].storage_path).toBe(`${owner}/original.webm`);
    expect(db.live_feed_videos[0].verification_status).toBe("pending");
    await processLiveVideo(client, "video-id", owner);
    expect(upload).toHaveBeenCalledTimes(3);
  });
  it("keeps a damaged recording unavailable and preserves the actionable error", async () => {
    const { db, client, upload } = setup();
    transcode.mockRejectedValueOnce(new Error("Damaged recording"));
    await expect(processLiveVideo(client, "video-id", owner)).rejects.toThrow(/Damaged/);
    expect(db.live_feed_videos[0].processing_status).toBe("failed");
    expect(upload).not.toHaveBeenCalled();
    expect(
      await signVideoAssets(client, {
        processing_status: "failed",
        playback_path: null,
        preview_path: null,
        poster_path: null,
      }),
    ).toEqual({ url: null, previewUrl: null, posterUrl: null });
  });
  it("cleans up partial derivatives on failed upload and rejects other owners before processing", async () => {
    const { client, upload, remove } = setup();
    await expect(processLiveVideo(client, "video-id", "someone-else")).rejects.toThrow(/not found/);
    expect(transcode).not.toHaveBeenCalled();
    upload
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: { message: "offline" } });
    await expect(processLiveVideo(client, "video-id", owner)).rejects.toThrow(/could not finish/);
    expect(remove).toHaveBeenCalledWith([expect.stringMatching(/full.mp4$/)]);
  });
});
