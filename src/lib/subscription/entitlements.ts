import { getAdmin } from "@/lib/whatsapp/db";
import { subscriptionRequiredMessage, type EffectiveEntitlements, type FeatureKey } from "./keys";

/** Server-only. Reads effective entitlements through the service-role RPC. */
export async function getUserEntitlements(userId: string): Promise<EffectiveEntitlements> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("get_effective_entitlements", { _uid: userId });
  if (error || !data) throw new Error("Couldn't check your subscription. Please try again.");
  return data as EffectiveEntitlements;
}

export async function hasEntitlement(userId: string, feature: FeatureKey): Promise<boolean> {
  const admin = await getAdmin();
  const { data, error } = await admin.rpc("has_entitlement", { _uid: userId, _key: feature });
  if (error) throw new Error("Couldn't check your subscription. Please try again.");
  return data === true;
}

/** Throws SUBSCRIPTION_REQUIRED:<feature> unless the user is entitled. Fails closed. */
export async function requireEntitlement(userId: string, feature: FeatureKey): Promise<void> {
  if (!(await hasEntitlement(userId, feature))) {
    throw new Error(subscriptionRequiredMessage(feature));
  }
}
