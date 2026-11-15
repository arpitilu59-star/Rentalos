import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ffmpegExecutable, transcodeVideo, progressDuration } from "../video-transcode.server";

const binary = ffmpegExecutable();
const dir = mkdtempSync(join(tmpdir(), "video-test-"));
let stream: Uint8Array;
beforeAll(() => {
  stream = execFileSync(
    binary,
    [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=duration=6:size=320x240:rate=24",
      "-c:v",
      "libvpx",
      "-f",
      "webm",
      "pipe:1",
    ],
    { maxBuffer: 5 * 1024 * 1024 },
  );
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const duration = (path: string) =>
  progressDuration(
    execFileSync(
      binary,
      ["-v", "error", "-xerror", "-i", path, "-progress", "pipe:1", "-f", "null", "-"],
      { encoding: "utf8" },
    ),
  );

describe("complete room media processing", () => {
  it("turns a duration-less browser recording into seekable full MP4 + five-second preview + poster", async () => {
    const result = await transcodeVideo(stream, 6);
    writeFileSync(join(dir, "full.mp4"), result.full);
    writeFileSync(join(dir, "preview.mp4"), result.preview);
    expect(result.duration).toBeCloseTo(6, 0);
    expect(duration(join(dir, "full.mp4"))).toBeCloseTo(6, 0);
    expect(duration(join(dir, "preview.mp4"))).toBeCloseTo(5, 0);
    expect(result.full.indexOf(Buffer.from("moov"))).toBeLessThan(
      result.full.indexOf(Buffer.from("mdat")),
    );
    expect(result.poster[0]).toBe(0xff);
    expect(result.poster[1]).toBe(0xd8);
    expect(result.preview.length).toBeLessThan(result.full.length);
    execFileSync(binary, [
      "-v",
      "error",
      "-xerror",
      "-ss",
      "4",
      "-i",
      join(dir, "full.mp4"),
      "-frames:v",
      "1",
      "-f",
      "null",
      "-",
    ]);
  }, 30000);
  it("rejects corrupt and incomplete files instead of accepting partial playback", async () => {
    await expect(transcodeVideo(stream.slice(0, 700), 6)).rejects.toThrow(/damaged|incomplete/);
    await expect(transcodeVideo(stream, 20)).rejects.toThrow(/damaged|incomplete/);
  }, 30000);
  it("normalizes portrait phone MP4 without cropping the room", async () => {
    const p = join(dir, "portrait.mp4");
    execFileSync(binary, [
      "-v",
      "error",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=duration=5:size=240x320:rate=24",
      "-c:v",
      "libx264",
      p,
    ]);
    const result = await transcodeVideo(readFileSync(p), 5);
    writeFileSync(join(dir, "portrait-full.mp4"), result.full);
    const probe = execFileSync(
      binary,
      ["-hide_banner", "-i", join(dir, "portrait-full.mp4"), "-frames:v", "1", "-f", "null", "-"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    expect(result.duration).toBeCloseTo(5, 0);
    expect(result.full.length).toBeGreaterThan(1000);
    expect(probe).toBe("");
  }, 30000);
});
