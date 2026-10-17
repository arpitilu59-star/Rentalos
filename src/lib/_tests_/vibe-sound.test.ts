import { describe, it, expect } from "vitest";
import { vibeNotes, vibeDuration } from "../vibe-sound";

describe("vibe sound", () => {
  it("has audible, in-range notes and a short total length", () => {
    const n = vibeNotes();
    expect(n.length).toBeGreaterThan(8);
    for (const [s, f, d] of n) {
      expect(s).toBeGreaterThanOrEqual(0);
      expect(f).toBeGreaterThan(100);
      expect(f).toBeLessThan(1200);
      expect(d).toBeGreaterThan(0);
    }
    expect(vibeDuration()).toBeLessThan(7);
  });
});
