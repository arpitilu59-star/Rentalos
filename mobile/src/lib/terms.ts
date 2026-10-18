const L: Record<string, string> = {
  yes: "Yes", no: "No", not_specified: "", allowed: "Allowed", limited: "Limited", not_allowed: "Not allowed",
  male: "Boys only", female: "Girls only", any: "Anyone", included: "Included in rent", metered: "Metered (per unit)",
  fixed: "Fixed monthly", required: "Required", not_required: "Not required", none: "No meals", breakfast: "Breakfast",
  two_meals: "2 meals/day", three_meals: "3 meals/day", veg: "Veg", non_veg: "Non-veg", both: "Veg & non-veg",
};
const v = (x: unknown) => (typeof x === "string" ? L[x] ?? x : "");

/** Flattens the owner's terms JSON into label/value rows (only what the owner actually specified). */
export function termsRows(t: any, rent: number, deposit: number | null): Array<[string, string]> {
  if (!t) return [];
  const rows: Array<[string, string | null | undefined]> = [
    ["Monthly rent", "₹" + Math.round(rent).toLocaleString("en-IN")],
    ["Security deposit", deposit != null ? "₹" + Math.round(deposit).toLocaleString("en-IN") : null],
    ["Deposit refund", t.deposit_refund_days != null ? `within ${t.deposit_refund_days} days of move-out` : null],
    ["Notice period", t.notice_period_days != null ? `${t.notice_period_days} days` : null],
    ["Lock-in", t.lock_in_months != null ? `${t.lock_in_months} months` : null],
    ["Rent increase", t.rent_escalation?.percent && t.rent_escalation?.every_months ? `${t.rent_escalation.percent}% every ${t.rent_escalation.every_months} months` : null],
    ["Electricity", v(t.electricity) + (t.electricity_rate ? ` (₹${t.electricity_rate})` : "")],
    ["Maintenance charge", t.maintenance_charge != null ? `₹${t.maintenance_charge}/month` : null],
    ["For", v(t.gender)],
    ["Food", t.food?.included === "yes" ? [v(t.food.meals), v(t.food.type)].filter(Boolean).join(", ") || "Included" : v(t.food?.included)],
    ["Visitors", v(t.visitors)], ["Smoking", v(t.smoking)], ["Alcohol", v(t.alcohol)], ["Pets", v(t.pets)],
    ["Curfew", t.curfew?.enabled === "yes" ? `Yes${t.curfew.time ? ` at ${t.curfew.time}` : ""}` : v(t.curfew?.enabled)],
    ["Cooking", v(t.cooking)], ["AC", v(t.ac)], ["WiFi", v(t.wifi)], ["Laundry", v(t.laundry)],
    ["Two-wheeler parking", v(t.parking_two_wheeler)], ["Car parking", v(t.parking_four_wheeler)],
    ["Agreement", v(t.agreement)], ["ID proof", v(t.id_proof_required)], ["Police verification", v(t.police_verification)],
    ["Owner handles", Array.isArray(t.landlord_responsibilities) && t.landlord_responsibilities.length ? t.landlord_responsibilities.join(", ") : null],
    ["You handle", Array.isArray(t.tenant_responsibilities) && t.tenant_responsibilities.length ? t.tenant_responsibilities.join(", ") : null],
    ["Other rules", t.extra_rules || null],
  ];
  return rows.filter((r): r is [string, string] => !!r[1]);
}
