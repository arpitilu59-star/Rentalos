import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { VIDEO_PROCESSING_ERROR } from "./video-media";

export function ffmpegExecutable(): string {
  // Kept external and explicitly traced into the Vercel function (nitro.config.ts).
  const binary = process.env.FFMPEG_PATH || ffmpegPath;
  if (!binary) throw new Error("Video processing is temporarily unavailable. Please try again.");
  return binary;
}

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      ffmpegExecutable(),
      ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", ...args],
      { timeout: 90000, maxBuffer: 2 * 1024 * 1024, windowsHide: true },
      (error, stdout, stderr) => {
        if (error) {
          console.error("[video] conversion failed", {
            code: error.code,
            detail: stderr.slice(-1200),
          });
          reject(new Error(VIDEO_PROCESSING_ERROR));
        } else resolve(stdout);
      },
    );
  });
}

export function progressDuration(progress: string) {
  const times = [...progress.matchAll(/^out_time_us=(\d+)$/gm)];
  return times.length ? Number(times[times.length - 1][1]) / 1_000_000 : 0;
}

/** Decode every input frame. A bad packet must fail, never produce a "successful" partial video. */
export async function transcodeVideo(input: Uint8Array, claimedSeconds: number) {
  const dir = await mkdtemp(join(tmpdir(), "rentalos-video-"));
  try {
    const source = join(dir, "source"),
      full = join(dir, "full.mp4");
    const preview = join(dir, "preview.mp4"),
      poster = join(dir, "poster.jpg");
    await writeFile(source, input);
    const progress = await run([
      "-xerror",
      "-err_detect",
      "explode",
      "-threads",
      "2",
      "-protocol_whitelist",
      "file,pipe",
      "-format_whitelist",
      "mov,matroska,webm",
      "-i",
      source,
      "-map",
      "0:v:0",
      "-map",
      "0:a:0?",
      "-t",
      "46",
      "-vf",
      "scale=w='min(1280,iw)':h='min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1,fps=30",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-preset",
      "veryfast",
      "-crf",
      "24",
      "-pix_fmt",
      "yuv420p",
      "-profile:v",
      "main",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      "-progress",
      "pipe:1",
      "-nostats",
      full,
    ]);
    const duration = progressDuration(progress);
    if (
      !Number.isFinite(duration) ||
      duration < 4.9 ||
      duration > 45.5 ||
      duration < claimedSeconds - 1
    ) {
      throw new Error(VIDEO_PROCESSING_ERROR);
    }
    // Also decode the complete output, rather than trusting only the encoder exit code.
    await run(["-xerror", "-i", full, "-map", "0:v:0", "-map", "0:a:0?", "-f", "null", "-"]);
    await run([
      "-i",
      full,
      "-t",
      "5",
      "-vf",
      "scale=w='min(480,iw)':h='min(480,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,fps=24",
      "-c:v",
      "libx264",
      "-threads",
      "2",
      "-preset",
      "veryfast",
      "-crf",
      "27",
      "-pix_fmt",
      "yuv420p",
      "-an",
      "-movflags",
      "+faststart",
      preview,
    ]);
    await run([
      "-i",
      full,
      "-frames:v",
      "1",
      "-vf",
      "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease",
      "-q:v",
      "3",
      poster,
    ]);
    return {
      full: await readFile(full),
      preview: await readFile(preview),
      poster: await readFile(poster),
      duration,
    };
  } finally {
    // dir is created by mkdtemp under the OS temporary directory, never from a user path.
    await rm(dir, { recursive: true, force: true });
  }
}
