/** City helpers for SEO landing pages (/rooms-in/<slug>). Pure, unit-tested. */

/** Large rental markets that get a landing page even before they have listings (noindex until then). */
export const KNOWN_CITIES = [
  "Jaipur", "Delhi", "Mumbai", "Bengaluru", "Hyderabad", "Chennai", "Kolkata", "Pune", "Ahmedabad",
  "Lucknow", "Kanpur", "Nagpur", "Indore", "Bhopal", "Patna", "Ranchi", "Chandigarh", "Gurugram",
  "Noida", "Ghaziabad", "Faridabad", "Greater Noida", "Dehradun", "Kota", "Jodhpur", "Udaipur",
  "Ajmer", "Bikaner", "Surat", "Vadodara", "Rajkot", "Visakhapatnam", "Coimbatore", "Kochi",
  "Thiruvananthapuram", "Mysuru", "Bhubaneswar", "Guwahati", "Varanasi", "Prayagraj", "Agra",
  "Meerut", "Amritsar", "Ludhiana", "Jalandhar", "Raipur", "Vijayawada", "Mangaluru", "Nashik",
  "Aurangabad", "Navi Mumbai", "Thane", "Sikar", "Alwar", "Bhilwara", "Jammu", "Shimla",
] as const;

/** "Navi Mumbai" -> "navi-mumbai". Strips accents/punctuation; never returns an empty segment. */
export function slugifyCity(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "navi-mumbai" -> "Navi Mumbai" (display fallback when the city isn't in KNOWN_CITIES). */
export function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Canonical display name for a slug: a known city's spelling, else a title-cased slug. */
export function cityFromSlug(slug: string): string | null {
  const s = slugifyCity(slug);
  if (!s || s.length > 60) return null;
  const known = KNOWN_CITIES.find((c) => slugifyCity(c) === s);
  return known ?? titleCase(s);
}

export function isKnownCity(slug: string): boolean {
  const s = slugifyCity(slug);
  return KNOWN_CITIES.some((c) => slugifyCity(c) === s);
}

/** Group raw listing city strings ("jaipur", "Jaipur ", "JAIPUR") into one entry per city. */
export function groupCities(raw: Array<string | null | undefined>): Array<{ slug: string; name: string; count: number }> {
  const m = new Map<string, { slug: string; name: string; count: number }>();
  for (const r of raw) {
    const v = (r ?? "").trim();
    if (!v) continue;
    const slug = slugifyCity(v);
    if (!slug) continue;
    const cur = m.get(slug);
    if (cur) cur.count++;
    else m.set(slug, { slug, name: cityFromSlug(slug) ?? v, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
