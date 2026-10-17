import { describe, it, expect } from "vitest";
import { cityAbout } from "../city-about";
import { KNOWN_CITIES } from "../cities";

describe("city about", () => {
  it("every known city has specific about text", () => {
    for (const c of KNOWN_CITIES) {
      const a = cityAbout(c);
      expect(a.specific, c).toBe(true);
      expect(a.paragraphs.join(" ")).toContain(c);
    }
  });
  it("unknown cities get a generic fallback", () => {
    expect(cityAbout("Somewhere").specific).toBe(false);
  });
});
