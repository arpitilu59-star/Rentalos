import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpeg from "ffmpeg-static";
import { patchWebmDuration } from "../webm-fix";

const dur = (file: string) => {
  const info = spawnSync(ffmpeg!, ["-hide_banner", "-i", file], { encoding: "utf8" }).stderr;
  const value = /Duration: ([^,]+)/.exec(info)?.[1];
  if (!value || value === "N/A") return "N/A";
  const [h, m, s] = value.split(":").map(Number);
  return String(h * 3600 + m * 60 + s);
};

describe("patchWebmDuration (real streaming WebM)", () => {
  const dir = mkdtempSync(join(tmpdir(), "webm-"));
  const src = join(dir, "stream.webm");
  beforeAll(() => {
    const out = execFileSync(
      ffmpeg!,
      [
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=6:size=320x240:rate=20",
        "-c:v",
        "libvpx",
        "-f",
        "webm",
        "pipe:1",
      ],
      { maxBuffer: 50 * 1024 * 1024 },
    );
    writeFileSync(src, out);
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("starts with no duration (the bug)", () => {
    expect(dur(src)).toBe("N/A");
  });
  it("adds the real duration and stays decodable + seekable", () => {
    const fixed = patchWebmDuration(new Uint8Array(readFileSync(src)), 6000);
    const f = join(dir, "fixed.webm");
    writeFileSync(f, fixed);
    expect(Number(dur(f))).toBeCloseTo(6, 0);
    execFileSync(ffmpeg!, [
      "-v",
      "error",
      "-ss",
      "3",
      "-i",
      f,
      "-frames:v",
      "1",
      "-y",
      join(dir, "f.png"),
    ]);
    execFileSync(ffmpeg!, ["-v", "error", "-i", f, "-f", "null", "-"]); // full decode, no errors
  });
  it("is idempotent and leaves non-WebM bytes alone", () => {
    const fixed = patchWebmDuration(new Uint8Array(readFileSync(src)), 6000);
    expect(patchWebmDuration(fixed, 9000)).toBe(fixed);
    const junk = new Uint8Array(200).fill(7);
    expect(patchWebmDuration(junk, 5000)).toBe(junk);
  });
});
