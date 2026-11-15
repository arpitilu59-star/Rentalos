import { describe, expect, it } from "vitest";
import {
  activeBrowseFilters,
  fetchLimit,
  likeContains,
  parseBrowseSearch,
  parseTermsFilters,
} from "@/lib/browse-filters";

describe("browse URL boundary regressions", () => {
  it("ignores empty fields without turning an empty budget into zero", () => {
    expect(parseBrowseSearch({ city: " \t", q: "", minRent: " ", maxRent: "", pages: "" })).toEqual(
      {},
    );
    expect(parseBrowseSearch({ maxRent: "0" })).toEqual({ maxRent: 0 });
  });
  it("rejects non-finite numbers and structured values in scalar parameters", () => {
    expect(
      parseBrowseSearch({
        minRent: Infinity,
        maxRent: "NaN",
        pages: true,
        city: ["Jaipur"],
        q: { text: "room" },
      }),
    ).toEqual({});
    expect(parseBrowseSearch({ minRent: [5000], maxRent: false, pages: "Infinity" })).toEqual({});
  });
  it("rounds fractional rents while preserving an explicit upper-bound minimum", () => {
    expect(parseBrowseSearch({ minRent: "1200.4", maxRent: "2400.6" })).toEqual({
      minRent: 1200,
      maxRent: 2401,
    });
    expect(parseBrowseSearch({ minRent: 50000, maxRent: 50000 })).toEqual({ minRent: 50000 });
  });
  it("drops unsupported occupancy, room size and sort values", () => {
    expect(
      parseBrowseSearch({ occ: "unknown", size: "palace", sort: "cheapest", type: ["pg"] }),
    ).toEqual({});
  });
  it("requires actual booleans for facilities and preserves explicit unknown exclusion", () => {
    expect(parseTermsFilters({ wifi: "true", pets: 1, ac: false, includeUnknown: false })).toEqual({
      includeUnknown: false,
    });
    expect(parseTermsFilters({ includeUnknown: "false" })).toBeUndefined();
    expect(parseTermsFilters('[{"wifi":true}]')).toBeUndefined();
    expect(parseTermsFilters("null")).toBeUndefined();
  });
  it("accepts notice and lock-in endpoints but rejects out-of-range values", () => {
    expect(parseTermsFilters({ maxNoticeDays: "365", maxLockInMonths: "60" })).toEqual({
      maxNoticeDays: 365,
      maxLockInMonths: 60,
    });
    expect(parseTermsFilters({ maxNoticeDays: 0, maxLockInMonths: 0 })).toEqual({
      maxNoticeDays: 0,
      maxLockInMonths: 0,
    });
    expect(parseTermsFilters({ maxNoticeDays: -1, maxLockInMonths: 61 })).toBeUndefined();
  });
  it("survives a URL round trip with Unicode and encoded terms", () => {
    const query = new URLSearchParams({
      city: "  नई\tदिल्ली  ",
      q: "Park\n View",
      minRent: "5000",
      tf: JSON.stringify({ wifi: true, includeUnknown: false }),
    });
    const normalized = parseBrowseSearch(Object.fromEntries(query));
    expect(normalized).toEqual({
      city: "नई दिल्ली",
      q: "Park View",
      minRent: 5000,
      tf: { wifi: true, includeUnknown: false },
    });
    expect(parseBrowseSearch(normalized)).toEqual(normalized);
  });
  it("does not count sort or pagination as filters and counts zero rent", () => {
    expect(activeBrowseFilters({ sort: "rent_desc", pages: 4 }, 0)).toBe(0);
    expect(activeBrowseFilters({ maxRent: 0 }, 0)).toBe(1);
    expect(fetchLimit(parseBrowseSearch({ pages: "999" }), false)).toBe(288);
  });
  it("neutralises backslashes and repeated wildcard-only search input", () => {
    expect(likeContains("a\\b*_%")).toBe('"%a b%"');
    expect(likeContains('\\_%*"')).toBe('"%%"');
  });
});
