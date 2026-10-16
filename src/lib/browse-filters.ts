/** Pure helpers for the /myr/browse filters: URL parsing, PostgREST-safe patterns, counts. */
import type { TermsFilters } from "@/lib/terms/match";

export const RENT_MIN = 0;
export const RENT_MAX = 50000;
export const RENT_STEP = 500;
export const PAGE_SIZE = 24;
export const TERMS_FETCH_CAP = 300;

export const PROPERTY_TYPES = ["pg", "room", "flat", "hostel", "shared"] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];
export const SORTS = ["newest", "rent_asc", "rent_desc"] as const;
export type Sort = (typeof SORTS)[number];

export type BrowseSearch = {
  city?: string;
  q?: string;
  minRent?: number;
  maxRent?: number;
  type?: PropertyType;
  sort?: Sort;
  pages?: number;
  tf?: TermsFilters;
};

const num = (v: unknown): number | undefined => {
  const n = typeof v === "number" ? v : typeof v === "string" && v.trim() !== "" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : undefined;
};
const str = (v: unknown, max: number): string | undefined => {
  if (typeof v !== "string") return undefined;
  const t = v.replace(/\s+/g, " ").trim().slice(0, max);
  return t || undefined;
};

const TF_BOOLS = [
  "pets", "smoking", "alcohol", "visitors", "noCurfew", "cooking", "ac", "wifi",
  "electricityIncluded", "agreementNotRequired",
] as const;

/** Whitelist-parse the terms filter object that rides in the URL (never trust it blindly). */
export function parseTermsFilters(raw: unknown): TermsFilters | undefined {
  let o: unknown = raw;
  if (typeof raw === "string") {
    try {
      o = JSON.parse(raw);
    } catch {
      return undefined;
    }
  }
  if (!o || typeof o !== "object" || Array.isArray(o)) return undefined;
  const r = o as Record<string, unknown>;
  const f: TermsFilters = {};
  if (r.gender === "male" || r.gender === "female") f.gender = r.gender;
  if (r.food === "included" || r.food === "veg") f.food = r.food;
  if (r.parking === "two_wheeler" || r.parking === "four_wheeler") f.parking = r.parking;
  for (const k of TF_BOOLS) if (r[k] === true) f[k] = true;
  const nd = num(r.maxNoticeDays);
  if (nd !== undefined && nd >= 0 && nd <= 365) f.maxNoticeDays = Math.round(nd);
  const lk = num(r.maxLockInMonths);
  if (lk !== undefined && lk >= 0 && lk <= 60) f.maxLockInMonths = Math.round(lk);
  if (r.includeUnknown === false) f.includeUnknown = false;
  return Object.keys(f).length ? f : undefined;
}

export function parseBrowseSearch(s: Record<string, unknown>): BrowseSearch {
  const out: BrowseSearch = {};
  const city = str(s.city, 60);
  if (city) out.city = city;
  const q = str(s.q, 60);
  if (q) out.q = q;
  let min = num(s.minRent);
  let max = num(s.maxRent);
  if (min !== undefined) min = Math.min(Math.max(Math.round(min), RENT_MIN), RENT_MAX);
  if (max !== undefined) max = Math.min(Math.max(Math.round(max), RENT_MIN), RENT_MAX);
  if (min !== undefined && max !== undefined && min > max) [min, max] = [max, min];
  if (min !== undefined && min > RENT_MIN) out.minRent = min;
  if (max !== undefined && max < RENT_MAX) out.maxRent = max;
  if ((PROPERTY_TYPES as readonly string[]).includes(s.type as string)) out.type = s.type as PropertyType;
  if ((SORTS as readonly string[]).includes(s.sort as string) && s.sort !== "newest") out.sort = s.sort as Sort;
  const pages = num(s.pages);
  if (pages !== undefined && pages > 1) out.pages = Math.min(Math.round(pages), 12);
  const tf = parseTermsFilters(s.tf);
  if (tf) out.tf = tf;
  return out;
}

/**
 * Safe value for a PostgREST `ilike` inside `.or(...)`. The value is double-quoted so commas and
 * parentheses can't break the filter, and LIKE wildcards typed by the user are neutralised.
 */
export function likeContains(v: string): string {
  const clean = v.replace(/[\\"%_*]/g, " ").replace(/\s+/g, " ").trim();
  return `"%${clean}%"`;
}

export function cityOrFilter(city: string): string {
  const p = likeContains(city);
  return `myr_city.ilike.${p},city.ilike.${p}`;
}

export function textOrFilter(q: string): string {
  const p = likeContains(q);
  return `name.ilike.${p},myr_address.ilike.${p},address.ilike.${p},myr_city.ilike.${p},city.ilike.${p}`;
}

/** Number of distinct filters the user has set (each terms filter counts once). */
export function activeBrowseFilters(s: BrowseSearch, termsCount: number): number {
  let n = 0;
  if (s.city) n++;
  if (s.q) n++;
  if (s.minRent !== undefined || s.maxRent !== undefined) n++;
  if (s.type) n++;
  return n + termsCount;
}

/** How many rows to request: terms filters run client-side, so they need a wider window. */
export function fetchLimit(s: BrowseSearch, termsActive: boolean): number {
  return termsActive ? TERMS_FETCH_CAP : PAGE_SIZE * (s.pages ?? 1);
}
