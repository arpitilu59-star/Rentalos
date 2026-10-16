import { describe, it, expect } from "vitest";
import {
  parseBrowseSearch, parseTermsFilters, likeContains, cityOrFilter, activeBrowseFilters, fetchLimit,
} from "@/lib/browse-filters";
import { slugifyCity, cityFromSlug, groupCities, isKnownCity } from "@/lib/cities";
import { buildSitemapXml } from "@/lib/sitemap";
import { googleErrorMessage } from "@/components/GoogleButton";

describe("parseBrowseSearch", () => {
  it("clamps, swaps and drops defaults", () => {
    expect(parseBrowseSearch({ minRent: "9000", maxRent: "3000" })).toEqual({ minRent: 3000, maxRent: 9000 });
    expect(parseBrowseSearch({ minRent: -5, maxRent: 999999 })).toEqual({});
    expect(parseBrowseSearch({ minRent: "abc" })).toEqual({});
  });
  it("whitelists type/sort and trims text", () => {
    const r = parseBrowseSearch({ city: "  Jaipur  ", type: "villa", sort: "rent_asc", q: "x".repeat(200) });
    expect(r.city).toBe("Jaipur");
    expect(r.type).toBeUndefined();
    expect(r.sort).toBe("rent_asc");
    expect(r.q).toHaveLength(60);
    expect(parseBrowseSearch({ sort: "newest" }).sort).toBeUndefined();
  });
  it("caps pages", () => {
    expect(parseBrowseSearch({ pages: 99 }).pages).toBe(12);
    expect(parseBrowseSearch({ pages: 1 }).pages).toBeUndefined();
  });
});

describe("terms filters in the URL", () => {
  it("keeps only known keys with valid values", () => {
    expect(parseTermsFilters({ gender: "female", pets: true, evil: "x", ac: false, maxNoticeDays: 30 })).toEqual({
      gender: "female", pets: true, maxNoticeDays: 30,
    });
    expect(parseTermsFilters({ gender: "robot" })).toBeUndefined();
    expect(parseTermsFilters('{"wifi":true}')).toEqual({ wifi: true });
    expect(parseTermsFilters("not json")).toBeUndefined();
    expect(parseTermsFilters({ maxNoticeDays: 99999 })).toBeUndefined();
  });
});

describe("PostgREST-safe patterns", () => {
  it("quotes and neutralises wildcards, commas and parentheses", () => {
    expect(likeContains('a,b)%_"c')).toBe('"%a,b) c%"');
    expect(cityOrFilter("Jaipur")).toBe('myr_city.ilike."%Jaipur%",city.ilike."%Jaipur%"');
  });
});

describe("counts and limits", () => {
  it("counts each filter once", () => {
    expect(activeBrowseFilters({ city: "X", minRent: 1, maxRent: 2, type: "pg" }, 3)).toBe(6);
  });
  it("terms filters widen the fetch window", () => {
    expect(fetchLimit({ pages: 2 }, false)).toBe(48);
    expect(fetchLimit({}, true)).toBe(300);
  });
});

describe("cities", () => {
  it("slugifies and maps back", () => {
    expect(slugifyCity("Navi Mumbai")).toBe("navi-mumbai");
    expect(slugifyCity("  Bengaluru!! ")).toBe("bengaluru");
    expect(cityFromSlug("navi-mumbai")).toBe("Navi Mumbai");
    expect(cityFromSlug("small-town")).toBe("Small Town");
    expect(cityFromSlug("")).toBeNull();
    expect(isKnownCity("JAIPUR")).toBe(true);
    expect(isKnownCity("atlantis")).toBe(false);
  });
  it("merges case/whitespace variants of the same city", () => {
    expect(groupCities(["jaipur", "Jaipur ", "JAIPUR", "Kota", null, ""])).toEqual([
      { slug: "jaipur", name: "Jaipur", count: 3 },
      { slug: "kota", name: "Kota", count: 1 },
    ]);
  });
});

describe("sitemap xml", () => {
  it("uses the correct namespace, escapes and dedupes", () => {
    const xml = buildSitemapXml("https://rentalos.in/", [
      { path: "/", priority: 1 },
      { path: "/", priority: 1 },
      { path: "/rooms-in/a&b", changefreq: "daily", lastmod: "2026-10-01T10:00:00Z" },
      { path: "bad", lastmod: "nope" },
    ]);
    expect(xml).toContain('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xml.match(/<url>/g)).toHaveLength(3);
    expect(xml).toContain("https://rentalos.in/rooms-in/a&amp;b");
    expect(xml).toContain("<lastmod>2026-10-01</lastmod>");
    expect(xml).toContain("https://rentalos.in/bad");
  });
});

describe("google sign-in errors", () => {
  it("explains a disabled provider", () => {
    expect(googleErrorMessage("Unsupported provider: provider is not enabled")).toMatch(/isn't switched on/);
    expect(googleErrorMessage("fetch failed")).toMatch(/Network/);
    expect(googleErrorMessage(undefined)).toMatch(/Couldn't start/);
  });
});
