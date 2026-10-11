/**
 * Deterministic filtering + "why this matches" for listings. No AI, no scores
 * from thin air: every reason is a comparison between a filter the user chose
 * and a value the landlord stated. Unknown values are shown as unknown.
 */
import { NS, type Terms } from "./schema";

export type TermsFilters = {
  gender?: "male" | "female";
  food?: "included" | "veg";
  pets?: boolean;
  smoking?: boolean;
  alcohol?: boolean;
  visitors?: boolean;
  noCurfew?: boolean;
  cooking?: boolean;
  ac?: boolean;
  wifi?: boolean;
  parking?: "two_wheeler" | "four_wheeler";
  electricityIncluded?: boolean;
  maxNoticeDays?: number;
  maxLockInMonths?: number;
  agreementNotRequired?: boolean;
  /** Listings that don't state a field still show up (flagged). Default true. */
  includeUnknown?: boolean;
};

export type Reason = { ok: boolean | null; text: string }; // null = not specified by landlord

export function activeFilterCount(f: TermsFilters): number {
  const { includeUnknown: _i, ...rest } = f;
  return Object.values(rest).filter((v) => v !== undefined && v !== false).length;
}

export function evaluate(terms: Terms | null | undefined, f: TermsFilters) {
  const reasons: Reason[] = [];
  const t = terms ?? null;
  const add = (ok: boolean | null, yes: string, no: string, unk: string) =>
    reasons.push({ ok, text: ok === null ? unk : ok ? yes : no });

  if (f.gender) {
    const g = t?.gender ?? NS;
    add(
      g === NS ? null : g === f.gender || g === "any",
      `Accepts ${f.gender} tenants`,
      `Not for ${f.gender} tenants`,
      "Gender policy not specified",
    );
  }
  if (f.food === "included") {
    const v = t?.food.included ?? NS;
    add(v === NS ? null : v === "yes", "Food included", "Food not included", "Food not specified");
  }
  if (f.food === "veg") {
    const v = t?.food.type ?? NS;
    add(
      v === NS ? null : v === "veg" || v === "both",
      "Veg food available",
      "No veg option",
      "Food type not specified",
    );
  }
  const allow = (key: "pets" | "smoking" | "alcohol", on?: boolean, name?: string) => {
    if (!on) return;
    const v = t?.[key] ?? NS;
    add(
      v === NS ? null : v === "allowed",
      `${name} allowed`,
      `${name} not allowed`,
      `${name} policy not specified`,
    );
  };
  allow("pets", f.pets, "Pets");
  allow("smoking", f.smoking, "Smoking");
  allow("alcohol", f.alcohol, "Alcohol");
  if (f.visitors) {
    const v = t?.visitors ?? NS;
    add(
      v === NS ? null : v !== "not_allowed",
      "Visitors allowed",
      "Visitors not allowed",
      "Visitor policy not specified",
    );
  }
  if (f.noCurfew) {
    const v = t?.curfew.enabled ?? NS;
    add(
      v === NS ? null : v === "no",
      "No curfew",
      `Curfew${t?.curfew.time ? ` at ${t.curfew.time}` : ""}`,
      "Curfew not specified",
    );
  }
  const tri = (key: "cooking" | "ac" | "wifi", on: boolean | undefined, name: string) => {
    if (!on) return;
    const v = t?.[key] ?? NS;
    add(
      v === NS ? null : v === "yes",
      `${name} available`,
      `No ${name.toLowerCase()}`,
      `${name} not specified`,
    );
  };
  tri("cooking", f.cooking, "Cooking");
  tri("ac", f.ac, "AC");
  tri("wifi", f.wifi, "Wi-Fi");
  if (f.parking) {
    const v =
      f.parking === "two_wheeler"
        ? (t?.parking_two_wheeler ?? NS)
        : (t?.parking_four_wheeler ?? NS);
    const name = f.parking === "two_wheeler" ? "Two-wheeler parking" : "Car parking";
    add(
      v === NS ? null : v === "yes",
      `${name} available`,
      `No ${name.toLowerCase()}`,
      `${name} not specified`,
    );
  }
  if (f.electricityIncluded) {
    const v = t?.electricity ?? NS;
    add(
      v === NS ? null : v === "included",
      "Electricity included",
      "Electricity billed separately",
      "Electricity not specified",
    );
  }
  if (f.maxNoticeDays !== undefined) {
    const n = t?.notice_period_days ?? null;
    add(
      n === null ? null : n <= f.maxNoticeDays,
      `Notice ${n} days`,
      `Notice ${n} days (over ${f.maxNoticeDays})`,
      "Notice period not specified",
    );
  }
  if (f.maxLockInMonths !== undefined) {
    const n = t?.lock_in_months ?? null;
    add(
      n === null ? null : n <= f.maxLockInMonths,
      `Lock-in ${n} months`,
      `Lock-in ${n} months (over ${f.maxLockInMonths})`,
      "Lock-in not specified",
    );
  }
  if (f.agreementNotRequired) {
    const v = t?.agreement ?? NS;
    add(
      v === NS ? null : v === "not_required",
      "No agreement needed",
      "Agreement required",
      "Agreement not specified",
    );
  }

  const ok = reasons.filter((r) => r.ok === true).length;
  const bad = reasons.filter((r) => r.ok === false).length;
  const unknown = reasons.filter((r) => r.ok === null).length;
  const include = bad === 0 && (unknown === 0 || f.includeUnknown !== false);
  const total = reasons.length;
  const score = total === 0 ? null : Math.round(((ok + 0.5 * unknown) / total) * 100);
  return { include, score, ok, bad, unknown, reasons };
}
