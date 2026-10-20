import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { checkMeterReading, type MeterCheckInput } from "../meter-validation";

const base: MeterCheckInput = {
  raw: "",
  prev: 1000,
  date: "2026-10-20",
  today: "2026-10-20",
  existingDates: ["2026-09-20"],
  typicalDelta: 120,
};
const run = (o: Partial<MeterCheckInput>) => checkMeterReading({ ...base, ...o });

describe("meter reading checks", () => {
  it("accepts a normal reading and reports usage", () => {
    const r = run({ raw: "1110" });
    expect(r.ok).toBe(true);
    expect(r.value).toBe(1110);
    expect(r.delta).toBe(110);
  });

  it("empty input is not valid yet but shows no error", () => {
    const r = run({ raw: "" });
    expect(r.ok).toBe(false);
    expect(r.errors).toEqual([]);
  });

  it("supports the red decimal digit written with a dot", () => {
    const r = run({ raw: "1110.6" });
    expect(r.ok).toBe(true);
    expect(r.value).toBeCloseTo(1110.6);
    expect(r.delta).toBeCloseTo(110.6);
  });

  it("rejects commas (Indian grouping vs decimal comma is ambiguous)", () => {
    expect(run({ raw: "1,110" }).ok).toBe(false);
    expect(run({ raw: "1110,6" }).errors[0]).toMatch(/Comma/);
    expect(run({ raw: "1 110" }).ok).toBe(false);
  });

  it("rejects negatives, letters and absurd values", () => {
    for (const raw of ["-5", "12a", "1e5", "..", "99999999999"])
      expect(run({ raw }).ok).toBe(false);
  });

  it("allows at most 2 decimals and warns on 2", () => {
    expect(run({ raw: "1110.123" }).ok).toBe(false);
    const r = run({ raw: "1110.25" });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("never silently accepts a lower reading: needs a written reason", () => {
    const noReason = run({ raw: "900" });
    expect(noReason.needsReason).toBe(true);
    expect(noReason.ok).toBe(false);
    expect(run({ raw: "900", reason: "short" }).ok).toBe(false);
    expect(run({ raw: "900", reason: "Meter replaced by electricity board" }).ok).toBe(true);
  });

  it("treats a decimal drop as lower too", () => {
    expect(run({ raw: "999.9" }).needsReason).toBe(true);
  });

  it("flags a suspicious jump and requires explicit confirmation", () => {
    const r = run({ raw: "2500" });
    expect(r.needsConfirmHigh).toBe(true);
    expect(r.ok).toBe(false);
    expect(run({ raw: "2500", confirmHigh: true }).ok).toBe(true);
  });

  it("does not flag a jump when there is no history to compare with", () => {
    const r = run({ raw: "50000", typicalDelta: null });
    expect(r.needsConfirmHigh).toBe(false);
    expect(r.ok).toBe(true);
  });

  it("first reading for a room (no previous) is accepted", () => {
    expect(run({ raw: "120", prev: null, typicalDelta: null }).ok).toBe(true);
  });

  it("blocks future dates and duplicate dates", () => {
    expect(run({ raw: "1100", date: "2026-10-21" }).ok).toBe(false);
    expect(run({ raw: "1100", date: "2026-09-20" }).errors[0]).toMatch(/pehle se/);
  });

  it("same reading as before is allowed but warned", () => {
    const r = run({ raw: "1000" });
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBe(1);
  });

  it("the app copy is byte-identical to the server rules", () => {
    expect(readFileSync("landlord/src/lib/meter-check.ts", "utf8")).toBe(
      readFileSync("src/lib/meter-validation.ts", "utf8"),
    );
  });
});
