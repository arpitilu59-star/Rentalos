/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  FEATURE_KEYS,
  LIMIT_KEYS,
  PLAN_CODES,
  featureForPath,
  isSubscriptionRequiredError,
  isLimitReachedError,
  subscriptionRequiredMessage,
} from "@/lib/subscription/keys";

const mig = readFileSync(
  join(process.cwd(), "supabase/migrations/20260921000000_subscription_system.sql"),
  "utf8",
);

describe("keys stay in sync with the migration seed", () => {
  it("every feature/limit key and plan code exists in the database seed", () => {
    for (const k of [...FEATURE_KEYS, ...LIMIT_KEYS]) expect(mig).toContain(`'${k}'`);
    for (const c of PLAN_CODES) expect(mig).toContain(`'${c}'`);
  });
});

describe("route gating map", () => {
  it("maps RentDesk, verification, import and analytics routes", () => {
    expect(featureForPath("/tenants")).toBe("rentdesk_core");
    expect(featureForPath("/bills/123")).toBe("rentdesk_core");
    expect(featureForPath("/payment-verify")).toBe("payment_verification");
    expect(featureForPath("/partner-import")).toBe("partner_import");
    expect(featureForPath("/rooms/abc/analysis")).toBe("advanced_analytics");
  });
  it("leaves free routes open", () => {
    for (const p of [
      "/rooms",
      "/properties",
      "/subscription",
      "/bookings",
      "/rentdesk",
      "/verify-identity",
      "/tenantsfoo",
    ]) {
      expect(featureForPath(p)).toBeNull();
    }
  });
});

describe("error helpers", () => {
  it("round-trips the subscription-required marker and DB trigger message", () => {
    expect(
      isSubscriptionRequiredError(new Error(subscriptionRequiredMessage("ai_meter_ocr"))),
    ).toBe("ai_meter_ocr");
    expect(
      isSubscriptionRequiredError(new Error("RentDesk plan required: your subscription...")),
    ).toBe("rentdesk_core");
    expect(isSubscriptionRequiredError(new Error("other"))).toBeNull();
    expect(
      isLimitReachedError(new Error("Your plan allows 1 properties. Upgrade to add more.")),
    ).toBe(true);
  });
});

describe("requireEntitlement fails closed", () => {
  it("throws when not entitled or when the check errors; passes when entitled", async () => {
    let result: { data: unknown; error: unknown } = { data: false, error: null };
    vi.resetModules();
    vi.doMock("@/lib/whatsapp/db", () => ({ getAdmin: async () => ({ rpc: async () => result }) }));
    const { requireEntitlement } = await import("@/lib/subscription/entitlements");
    await expect(requireEntitlement("u", "ai_meter_ocr")).rejects.toThrow(
      /SUBSCRIPTION_REQUIRED:ai_meter_ocr/,
    );
    result = { data: null, error: { message: "db down" } };
    await expect(requireEntitlement("u", "ai_meter_ocr")).rejects.toThrow(/Couldn't check/);
    result = { data: true, error: null };
    await expect(requireEntitlement("u", "ai_meter_ocr")).resolves.toBeUndefined();
  });
});

describe("admin role gate", () => {
  it("only subscription roles pass; support/property admins and no-role fail", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/auth-middleware", () => ({
      requireSupabaseAuth: { server: () => ({}) },
    }));
    vi.doMock("@tanstack/react-start", () => ({
      createServerFn: () => {
        const c: any = new Proxy(() => c, { get: () => () => c });
        return c;
      },
    }));
    const { roleAllowed } = await import("@/lib/admin-subscriptions.functions");
    const { ADMIN_PAYMENT_ROLES, ADMIN_SUBSCRIPTION_WRITE_ROLES } =
      await import("@/lib/subscription/keys");
    expect(roleAllowed("finance_admin", ADMIN_PAYMENT_ROLES)).toBe(true);
    expect(roleAllowed("finance_admin", ADMIN_SUBSCRIPTION_WRITE_ROLES)).toBe(false);
    expect(roleAllowed("subscription_admin", ADMIN_SUBSCRIPTION_WRITE_ROLES)).toBe(true);
    expect(roleAllowed("support_admin", ADMIN_PAYMENT_ROLES)).toBe(false);
    expect(roleAllowed(null, ADMIN_PAYMENT_ROLES)).toBe(false);
  });
});
