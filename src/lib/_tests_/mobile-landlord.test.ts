import { describe, expect, it } from "vitest";
import { missingTermFields } from "../mobile-landlord.server";
import { TermsSchema, emptyTerms } from "../terms/schema";

describe("landlord listing: required terms", () => {
  it("an empty terms sheet lists everything a tenant needs to tick", () => {
    expect(missingTermFields(emptyTerms()).length).toBe(10);
  });

  it("is satisfied once the acknowledgement-backed fields are filled", () => {
    const t = TermsSchema.parse({
      gender: "male", visitors: "limited", smoking: "not_allowed", pets: "not_allowed", electricity: "metered", electricity_rate: 9,
      notice_period_days: 30, lock_in_months: 0, deposit_refund_days: 15,
      landlord_responsibilities: ["Water supply"], tenant_responsibilities: ["Keep room clean"],
    });
    expect(missingTermFields(t)).toEqual([]);
  });

  it("0 days / 0 months count as filled (no notice, no lock-in) but blank does not", () => {
    const base = { gender: "any", visitors: "allowed", smoking: "allowed", pets: "allowed", electricity: "included", landlord_responsibilities: ["a"], tenant_responsibilities: ["b"] };
    expect(missingTermFields(TermsSchema.parse({ ...base, notice_period_days: 0, lock_in_months: 0, deposit_refund_days: 0 }))).toEqual([]);
    expect(missingTermFields(TermsSchema.parse({ ...base, notice_period_days: 0, lock_in_months: 0 }))).toEqual(["Deposit refund kitne din mein"]);
  });
});
