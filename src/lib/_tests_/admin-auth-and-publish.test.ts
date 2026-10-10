import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assertActiveAdmin, type AdminLookupClient } from "../myr-admin.functions";
import { buildPropertyPublishPatch, buildRoomPublishPatch } from "../publish-patch";

function client(
  row: { role: string } | null,
  error: { message: string } | null = null,
): AdminLookupClient {
  const q = { eq: () => q, maybeSingle: async () => ({ data: row, error }) };
  return { from: () => ({ select: () => q as never }) };
}

describe("assertActiveAdmin", () => {
  it.each([
    "root_owner",
    "full_admin",
    "property_admin",
    "support_admin",
    "finance_admin",
    "subscription_admin",
  ])("allows active %s", async (role) => {
    await expect(assertActiveAdmin(client({ role }), "u")).resolves.toBe(role);
  });
  it("blocks users who are not active admins (tenants/landlords)", async () => {
    await expect(assertActiveAdmin(client(null), "u")).rejects.toThrow(/Admin access required/);
  });
  it("blocks when there is no user id", async () => {
    await expect(assertActiveAdmin(client({ role: "root_owner" }), undefined)).rejects.toThrow(
      /Not signed in/,
    );
  });
  it("fails closed on lookup errors", async () => {
    await expect(assertActiveAdmin(client(null, { message: "db down" }), "u")).rejects.toThrow(
      /Couldn't verify/,
    );
  });
});

describe("publishing is independent of document verification", () => {
  it("publish patches never set verification fields", () => {
    const p = buildPropertyPublishPatch({ publish: true, city: "Jaipur" });
    expect(p).toEqual({ is_public_listing: true, myr_city: "Jaipur" });
    expect(p).not.toHaveProperty("verification_status");
    expect(p).not.toHaveProperty("verified_at");
    expect(buildRoomPublishPatch({ publish: true })).toEqual({ is_public: true });
  });
  it("server functions no longer consult myr_verifications or throw KYC_REQUIRED", () => {
    const src = readFileSync("src/lib/bookings.functions.ts", "utf8");
    expect(src).not.toContain("KYC_REQUIRED");
    expect(src).not.toContain("myr_verifications");
    for (const f of [
      "src/routes/_authenticated/rooms.tsx",
      "src/routes/_authenticated/properties.tsx",
    ]) {
      expect(readFileSync(f, "utf8")).not.toContain("KYC_REQUIRED");
    }
  });
});
