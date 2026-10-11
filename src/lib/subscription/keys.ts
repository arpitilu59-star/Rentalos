/**
 * Shared (client + server) subscription constants. The DATABASE is the single
 * source of truth for what each plan includes (plan_entitlements); this file
 * only names the keys so code can refer to them safely, and maps routes to
 * the feature that unlocks them.
 */
export const PLAN_CODES = ["FREE", "RENTDESK", "RENTALOS_MANAGEMENT"] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export const FEATURE_KEYS = [
  "marketplace_browse",
  "basic_search",
  "roommate_match",
  "tenant_portal",
  "landlord_basic",
  "rentdesk_core",
  "payment_verification",
  "ai_meter_ocr",
  "live_feed_video",
  "document_storage",
  "rent_reminders",
  "basic_analytics",
  "advanced_analytics",
  "advanced_automation",
  "partner_import",
] as const;
export type FeatureKey = (typeof FEATURE_KEYS)[number];

export const LIMIT_KEYS = ["max_properties", "max_rooms"] as const;
export type LimitKey = (typeof LIMIT_KEYS)[number];

export const SUBSCRIPTION_STATUSES = [
  "FREE",
  "PENDING",
  "ACTIVE",
  "EXPIRED",
  "SUSPENDED",
  "CANCELLED",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const PAYMENT_STATUSES = [
  "DRAFT",
  "PENDING_REVIEW",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type EffectiveEntitlements = {
  plan_code: PlanCode;
  status: SubscriptionStatus;
  starts_at: string | null;
  expires_at: string | null;
  source: string | null;
  features: Record<string, boolean>;
  limits: Record<string, number | null>;
  has_rentdesk_data: boolean;
};

/** Landlord routes that need a feature. Anything not listed is open to every landlord. */
export const ROUTE_FEATURES: { prefix: string; feature: FeatureKey }[] = [
  { prefix: "/payment-verify", feature: "payment_verification" },
  { prefix: "/partner-import", feature: "partner_import" },
  { prefix: "/rooms/", feature: "advanced_analytics" }, // /rooms/$roomId/analysis only (see featureForPath)
  { prefix: "/tenants", feature: "rentdesk_core" },
  { prefix: "/bills", feature: "rentdesk_core" },
  { prefix: "/deposits", feature: "rentdesk_core" },
  { prefix: "/moves", feature: "rentdesk_core" },
  { prefix: "/maintenance", feature: "rentdesk_core" },
  { prefix: "/meters", feature: "rentdesk_core" },
];

export function featureForPath(pathname: string): FeatureKey | null {
  if (/^\/rooms\/[^/]+\/analysis/.test(pathname)) return "advanced_analytics";
  for (const r of ROUTE_FEATURES) {
    if (r.prefix === "/rooms/") continue;
    if (pathname === r.prefix || pathname.startsWith(r.prefix + "/")) return r.feature;
  }
  return null;
}

/** Marker used in thrown errors so the UI can show an upgrade prompt. */
export const SUBSCRIPTION_REQUIRED = "SUBSCRIPTION_REQUIRED";
export function subscriptionRequiredMessage(feature: string) {
  return `${SUBSCRIPTION_REQUIRED}:${feature} — your plan doesn't include this. Open Subscription to upgrade.`;
}
export function isSubscriptionRequiredError(e: unknown): string | null {
  const m = e instanceof Error ? e.message : String(e ?? "");
  const hit = /SUBSCRIPTION_REQUIRED:([a-z_]+)/.exec(m);
  if (hit) return hit[1];
  if (/RentDesk plan required/i.test(m)) return "rentdesk_core";
  return null;
}
export function isLimitReachedError(e: unknown): boolean {
  const m = e instanceof Error ? e.message : String(e ?? "");
  return /LIMIT_REACHED|Upgrade to add more/i.test(m);
}

export const PLAN_LABELS: Record<PlanCode, string> = {
  FREE: "Free",
  RENTDESK: "RentDesk",
  RENTALOS_MANAGEMENT: "Rentalos Management",
};

export const ADMIN_SUBSCRIPTION_ROLES = [
  "root_owner",
  "full_admin",
  "subscription_admin",
  "finance_admin",
] as const;
/** Roles allowed to change access (grant/extend/discount/override/settings). */
export const ADMIN_SUBSCRIPTION_WRITE_ROLES = [
  "root_owner",
  "full_admin",
  "subscription_admin",
] as const;
/** Roles allowed to approve / reject payments. */
export const ADMIN_PAYMENT_ROLES = [
  "root_owner",
  "full_admin",
  "subscription_admin",
  "finance_admin",
] as const;
