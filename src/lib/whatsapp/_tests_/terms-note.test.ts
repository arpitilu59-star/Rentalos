import { describe, it, expect } from "vitest";
import { detailWithTerms } from "../templates";

describe("detailWithTerms", () => {
  it("always keeps the terms reminder on booking messages, within 200 chars", () => {
    const d = detailWithTerms("booking_update", "x".repeat(500));
    expect(d.length).toBeLessThanOrEqual(200);
    expect(d).toContain("accepted terms");
  });
  it("keeps short text intact and adds the note", () => {
    expect(detailWithTerms("booking_update", "Your booking is accepted.")).toMatch(/^Your booking is accepted\. Rent, deposit/);
  });
  it("leaves other events alone and removes newlines", () => {
    expect(detailWithTerms("rent_overdue", "a\n\nb")).toBe("a b");
  });
});
