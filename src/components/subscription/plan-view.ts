export type PlanRow = {
  id: string;
  code: "FREE" | "RENTDESK" | "RENTALOS_MANAGEMENT";
  name: string;
  price_inr: number | string;
  description: string | null;
  billing_months: number;
};
export type FeatureRow = {
  feature_key: string;
  label: string;
  description: string | null;
  kind: "feature" | "limit";
};
export type EntRow = {
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value: number | null;
};

export function planLines(plan: PlanRow, features: FeatureRow[], ents: EntRow[]) {
  const mine = new Map(ents.filter((e) => e.plan_id === plan.id).map((e) => [e.feature_key, e]));
  return features.map((f) => {
    const e = mine.get(f.feature_key);
    if (f.kind === "limit") {
      const text = !e ? "—" : e.limit_value === null ? "Unlimited" : String(e.limit_value);
      return { key: f.feature_key, label: f.label, included: !!e, text };
    }
    return {
      key: f.feature_key,
      label: f.label,
      included: !!e?.enabled,
      text: e?.enabled ? "Included" : "Not included",
    };
  });
}
export const priceText = (p: PlanRow) =>
  Number(p.price_inr) === 0 ? "₹0" : `₹${Number(p.price_inr).toLocaleString("en-IN")}/mo`;
