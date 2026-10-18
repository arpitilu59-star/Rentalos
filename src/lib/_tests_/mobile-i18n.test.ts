import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { STRINGS } from "../../../mobile/src/lib/strings";
import { translate, translateLoose } from "../../../mobile/src/lib/translate";

describe("app language", () => {
  it("Hinglish shows the original text", () => {
    expect(translate("Apna room dhoondhein", "hinglish")).toBe("Apna room dhoondhein");
  });
  it("English and Hindi translate, unknown text passes through", () => {
    expect(translate("Apna room dhoondhein", "en")).toBe("Find your room");
    expect(translate("Apna room dhoondhein", "hi")).toBe("अपना कमरा ढूँढें");
    expect(translate("Home", "en")).toBe("Home");
    expect(translate("Home", "hi")).toBe("होम");
    expect(translate("Some unknown text", "hi")).toBe("Some unknown text");
  });
  it("fills {placeholders} in every language", () => {
    expect(translate("Compare {n} rooms", "en", { n: 3 })).toBe("Compare 3 rooms");
    expect(translate("Compare {n} rooms", "hi", { n: 3 })).toBe("3 कमरों की तुलना करें");
    expect(translate("Compare {n} rooms", "hinglish", { n: 3 })).toBe("Compare 3 rooms");
  });
  it("loose matching keeps surrounding spaces of sentence fragments", () => {
    expect(translateLoose(" · due ", "hi")).toBe(" · देय ");
    expect(translateLoose("Kata gaya ", "en")).toBe("Deducted ");
    expect(translateLoose("42", "hi")).toBe("42");
  });
  it("every entry has a Hindi text and keeps its placeholders in both languages", () => {
    for (const [k, [en, hi]] of Object.entries(STRINGS)) {
      expect(hi.trim().length, k).toBeGreaterThan(0);
      const vars = (x: string) => (x.match(/\{\w+\}/g) ?? []).sort().join();
      expect(vars(hi), `hi placeholders: ${k}`).toBe(vars(k));
      if (en) expect(vars(en), `en placeholders: ${k}`).toBe(vars(k));
    }
  });
  it("has no duplicate keys (a later one would silently win)", () => {
    const src = readFileSync("mobile/src/lib/strings.ts", "utf8");
    const keys = [...src.matchAll(/^\s*(?:\/\/.*\n\s*)?|"((?:[^"\\]|\\.)+)":\s*\[/gm)].map((m) => m[1]).filter(Boolean);
    const seen = new Set<string>(); const dup: string[] = [];
    for (const k of keys) { if (seen.has(k)) dup.push(k); seen.add(k); }
    expect(dup).toEqual([]);
  });
});
