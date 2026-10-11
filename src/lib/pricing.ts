/**
 * Plan names/prices/features now live in the database (subscription_plans,
 * feature_catalog, plan_entitlements) and are served by getPublicPlans.
 * Nothing here is a source of truth any more — see src/lib/subscription/keys.ts
 * for the shared key names.
 */
export { PLAN_CODES, PLAN_LABELS, type PlanCode } from "@/lib/subscription/keys";
