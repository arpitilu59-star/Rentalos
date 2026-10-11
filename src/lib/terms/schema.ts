/**
 * Structured rental terms. Every field defaults to "not_specified" so old
 * listings stay valid; nothing is ever invented for a listing that didn't say.
 * Shared by the landlord editor, public listing, filters, compatibility,
 * the booking gate and the server (validated again there).
 */
import { z } from "zod";

export const NS = "not_specified" as const;
const tri = z.enum(["yes", "no", NS]).default(NS);
const policy = z.enum(["allowed", "limited", "not_allowed", NS]).default(NS);
const days = z.number().int().min(0).max(365).nullable().default(null);
const money = z.number().min(0).max(1_000_000).nullable().default(null);
const line = z.string().trim().min(1).max(140);

export const TermsSchema = z.object({
  gender: z.enum(["male", "female", "any", NS]).default(NS),
  food: z
    .object({
      included: tri,
      meals: z.enum(["none", "breakfast", "two_meals", "three_meals", NS]).default(NS),
      type: z.enum(["veg", "non_veg", "both", NS]).default(NS),
    })
    .default({ included: NS, meals: NS, type: NS }),
  visitors: policy,
  smoking: z.enum(["allowed", "not_allowed", NS]).default(NS),
  alcohol: z.enum(["allowed", "not_allowed", NS]).default(NS),
  pets: z.enum(["allowed", "not_allowed", NS]).default(NS),
  curfew: z
    .object({
      enabled: tri,
      time: z
        .string()
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
        .nullable()
        .default(null),
    })
    .default({ enabled: NS, time: null }),
  cooking: tri,
  ac: tri,
  wifi: tri,
  laundry: tri,
  parking_two_wheeler: tri,
  parking_four_wheeler: tri,
  electricity: z.enum(["included", "metered", "fixed", NS]).default(NS),
  electricity_rate: money, // ₹/unit when metered, ₹/month when fixed
  maintenance_charge: money, // ₹/month
  notice_period_days: days,
  lock_in_months: z.number().int().min(0).max(60).nullable().default(null),
  deposit_refund_days: days,
  rent_escalation: z
    .object({
      percent: z.number().min(0).max(50).nullable().default(null),
      every_months: z.number().int().min(1).max(60).nullable().default(null),
    })
    .default({ percent: null, every_months: null }),
  agreement: z.enum(["required", "not_required", NS]).default(NS),
  id_proof_required: tri,
  police_verification: tri,
  landlord_responsibilities: z.array(line).max(10).default([]),
  tenant_responsibilities: z.array(line).max(10).default([]),
  extra_rules: z.string().trim().max(1000).default(""),
});
export type Terms = z.infer<typeof TermsSchema>;

export function emptyTerms(): Terms {
  return TermsSchema.parse({});
}

/** Fields that count toward "how complete is this listing's terms". */
export function completeness(t: Terms): number {
  const checks: boolean[] = [
    t.gender !== NS,
    t.food.included !== NS,
    t.visitors !== NS,
    t.smoking !== NS,
    t.alcohol !== NS,
    t.pets !== NS,
    t.curfew.enabled !== NS,
    t.cooking !== NS,
    t.ac !== NS,
    t.wifi !== NS,
    t.electricity !== NS,
    t.notice_period_days !== null,
    t.lock_in_months !== null,
    t.deposit_refund_days !== null,
    t.rent_escalation.percent !== null,
    t.agreement !== NS,
    t.id_proof_required !== NS,
    t.landlord_responsibilities.length > 0,
    t.tenant_responsibilities.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

/** Acknowledgement checkboxes a tenant must tick before requesting a booking. */
export const REQUIRED_ACKS = [
  "rent_and_deposit",
  "notice_and_lock_in",
  "house_rules",
  "charges_and_electricity",
  "responsibilities",
] as const;
export type AckKey = (typeof REQUIRED_ACKS)[number];
export const ACK_LABELS: Record<AckKey, string> = {
  rent_and_deposit: "I've read the rent, deposit and rent-increase terms.",
  notice_and_lock_in: "I understand the notice period, lock-in and deposit refund timeline.",
  house_rules: "I'll follow the house rules (visitors, smoking, pets, curfew etc.).",
  charges_and_electricity: "I understand electricity and other charges.",
  responsibilities: "I've read what the landlord and I are each responsible for.",
};

/** Year-by-year rent after escalation. Deterministic, no rounding drift (rounded per step). */
export function rentSchedule(
  rent: number,
  esc: Terms["rent_escalation"],
  horizonMonths = 36,
): { fromMonth: number; rent: number }[] {
  const out = [{ fromMonth: 1, rent: Math.round(rent) }];
  if (!esc.percent || !esc.every_months || esc.percent <= 0) return out;
  let cur = rent;
  for (let m = esc.every_months + 1; m <= horizonMonths; m += esc.every_months) {
    cur = Math.round(cur * (1 + esc.percent / 100));
    out.push({ fromMonth: m, rent: cur });
  }
  return out;
}

const LABEL: Record<string, string> = {
  yes: "Yes",
  no: "No",
  not_specified: "Not specified",
  allowed: "Allowed",
  limited: "Limited",
  not_allowed: "Not allowed",
  male: "Male only",
  female: "Female only",
  any: "Anyone",
  included: "Included in rent",
  metered: "Metered (per unit)",
  fixed: "Fixed monthly",
  required: "Required",
  not_required: "Not required",
  none: "No meals",
  breakfast: "Breakfast",
  two_meals: "2 meals/day",
  three_meals: "3 meals/day",
  veg: "Veg",
  non_veg: "Non-veg",
  both: "Veg & non-veg",
};
export const label = (v: string | null | undefined) => (v ? (LABEL[v] ?? v) : "Not specified");

/** Plain-text summary used by the "Listen" read-aloud. Never marks anything as agreed. */
export function termsToSpeech(t: Terms, room: { rent: number; deposit: number | null }): string {
  const parts: string[] = [];
  parts.push(`Monthly rent is ${room.rent} rupees.`);
  if (room.deposit != null) parts.push(`Security deposit is ${room.deposit} rupees.`);
  if (t.deposit_refund_days != null)
    parts.push(`Deposit is refunded within ${t.deposit_refund_days} days of move out.`);
  if (t.notice_period_days != null) parts.push(`Notice period is ${t.notice_period_days} days.`);
  if (t.lock_in_months != null) parts.push(`Lock in is ${t.lock_in_months} months.`);
  if (t.rent_escalation.percent && t.rent_escalation.every_months)
    parts.push(
      `Rent increases ${t.rent_escalation.percent} percent every ${t.rent_escalation.every_months} months.`,
    );
  if (t.electricity !== NS) parts.push(`Electricity: ${label(t.electricity)}.`);
  if (t.maintenance_charge != null)
    parts.push(`Maintenance charge is ${t.maintenance_charge} rupees per month.`);
  const rules: [string, string][] = [
    ["Visitors", t.visitors],
    ["Smoking", t.smoking],
    ["Alcohol", t.alcohol],
    ["Pets", t.pets],
  ];
  for (const [n, v] of rules) if (v !== NS) parts.push(`${n}: ${label(v)}.`);
  if (t.curfew.enabled === "yes" && t.curfew.time) parts.push(`Curfew at ${t.curfew.time}.`);
  if (t.landlord_responsibilities.length)
    parts.push(`Landlord is responsible for: ${t.landlord_responsibilities.join(", ")}.`);
  if (t.tenant_responsibilities.length)
    parts.push(`You are responsible for: ${t.tenant_responsibilities.join(", ")}.`);
  parts.push("This is only a read-aloud summary. Please read and tick the terms yourself.");
  return parts.join(" ");
}

export type Acks = Partial<Record<AckKey, boolean>>;
export function missingAcks(acks: Acks | undefined | null): AckKey[] {
  return REQUIRED_ACKS.filter((k) => acks?.[k] !== true);
}
