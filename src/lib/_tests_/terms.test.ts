import { describe, it, expect } from "vitest";
import {
  TermsSchema,
  emptyTerms,
  completeness,
  rentSchedule,
  missingAcks,
  termsToSpeech,
  REQUIRED_ACKS,
} from "@/lib/terms/schema";
import { evaluate, activeFilterCount } from "@/lib/terms/match";

const base = () => ({ ...emptyTerms() });

describe("terms schema", () => {
  it("empty terms are all not_specified / null and 0% complete", () => {
    const t = emptyTerms();
    expect(t.gender).toBe("not_specified");
    expect(t.notice_period_days).toBeNull();
    expect(completeness(t)).toBe(0);
  });
  it("rejects invalid values and accepts partial legacy input", () => {
    expect(() => TermsSchema.parse({ pets: "maybe" })).toThrow();
    expect(() => TermsSchema.parse({ notice_period_days: -1 })).toThrow();
    expect(TermsSchema.parse({ pets: "allowed" }).pets).toBe("allowed");
  });
  it("completeness rises as fields are stated", () => {
    const t = { ...base(), pets: "allowed" as const, wifi: "yes" as const, notice_period_days: 30 };
    expect(completeness(t)).toBeGreaterThan(0);
    expect(completeness(t)).toBeLessThan(100);
  });
});

describe("rent escalation schedule", () => {
  it("no escalation -> single entry", () => {
    expect(rentSchedule(8000, { percent: null, every_months: null })).toEqual([
      { fromMonth: 1, rent: 8000 },
    ]);
  });
  it("5% every 12 months over 36 months", () => {
    expect(rentSchedule(10000, { percent: 5, every_months: 12 }, 36)).toEqual([
      { fromMonth: 1, rent: 10000 },
      { fromMonth: 13, rent: 10500 },
      { fromMonth: 25, rent: 11025 },
    ]);
  });
});

describe("acknowledgements", () => {
  it("lists every missing required ack", () => {
    expect(missingAcks(undefined)).toHaveLength(REQUIRED_ACKS.length);
    expect(missingAcks({ rent_and_deposit: true })).not.toContain("rent_and_deposit");
    expect(missingAcks(Object.fromEntries(REQUIRED_ACKS.map((k) => [k, true])))).toEqual([]);
  });
  it("read-aloud text states it is not consent", () => {
    expect(termsToSpeech(base(), { rent: 8000, deposit: 16000 })).toMatch(
      /only a read-aloud summary/,
    );
  });
});

describe("filters and 'why this matches'", () => {
  const t = {
    ...base(),
    pets: "allowed" as const,
    smoking: "not_allowed" as const,
    notice_period_days: 30,
    wifi: "yes" as const,
  };
  it("matches stated values and explains", () => {
    const r = evaluate(t, { pets: true, wifi: true, maxNoticeDays: 30 });
    expect(r.include).toBe(true);
    expect(r.ok).toBe(3);
    expect(r.score).toBe(100);
    expect(r.reasons.map((x) => x.text)).toContain("Pets allowed");
  });
  it("excludes on an explicit mismatch", () => {
    expect(evaluate(t, { smoking: true }).include).toBe(false);
    expect(evaluate(t, { maxNoticeDays: 15 }).include).toBe(false);
  });
  it("unknown is flagged, included by default, excluded when strict", () => {
    const r = evaluate(t, { ac: true });
    expect(r.unknown).toBe(1);
    expect(r.include).toBe(true);
    expect(r.reasons[0].ok).toBeNull();
    expect(evaluate(t, { ac: true, includeUnknown: false }).include).toBe(false);
  });
  it("listing with no terms at all is all-unknown, never a false match", () => {
    const r = evaluate(null, { pets: true });
    expect(r.ok).toBe(0);
    expect(r.unknown).toBe(1);
    expect(r.score).toBe(50);
  });
  it("no filters -> include, no score", () => {
    const r = evaluate(t, {});
    expect(r.include).toBe(true);
    expect(r.score).toBeNull();
    expect(activeFilterCount({ includeUnknown: true })).toBe(0);
    expect(activeFilterCount({ pets: true, maxNoticeDays: 0 })).toBe(2);
  });
});
