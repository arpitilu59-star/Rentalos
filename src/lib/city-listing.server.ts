/**
 * Public, read-only city data for SEO pages and the sitemap. Uses the anon/publishable key on
 * purpose (not service-role): row-level security decides what is public, exactly as in browse.
 * Never selects landlord or tenant personal data.
 */
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { cityFromSlug, groupCities, isKnownCity, slugifyCity } from "@/lib/cities";

export function publicClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type RoomRow = {
  id: string;
  room_number: string;
  rent_amount: number;
  myr_amenities: string[] | null;
  myr_photos: unknown;
  updated_at?: string;
  properties: {
    name: string;
    myr_city: string | null;
    city: string | null;
    myr_address: string | null;
    address: string | null;
    property_type: string | null;
    myr_cover_photos: unknown;
  } | null;
};

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export type CityPageData = {
  slug: string;
  city: string;
  known: boolean;
  total: number;
  minRent: number | null;
  maxRent: number | null;
  types: string[];
  localities: string[];
  rooms: Array<{
    id: string;
    title: string;
    rent: number;
    type: string | null;
    locality: string | null;
    cover: string | null;
    amenities: string[];
  }>;
  otherCities: Array<{ slug: string; name: string; count: number }>;
};

export async function loadCityPage(slugInput: string): Promise<CityPageData | null> {
  const slug = slugifyCity(slugInput);
  const city = cityFromSlug(slug);
  if (!slug || !city) return null;
  const db = publicClient();

  // Exact, case-insensitive match; the pattern only ever contains [a-z0-9 ] (from the slug).
  const pattern = city.replace(/[^A-Za-z0-9 ]/g, "");
  const { data } = await db
    .from("rooms")
    .select(
      "id, room_number, rent_amount, myr_amenities, myr_photos, properties!inner(name, myr_city, city, myr_address, address, property_type, myr_cover_photos)",
    )
    .eq("is_public", true)
    .eq("myr_available", true)
    .or(`myr_city.ilike.${pattern},city.ilike.${pattern}`, { foreignTable: "properties" })
    .order("rent_amount", { ascending: true })
    .limit(200);

  const rows = ((data ?? []) as unknown as RoomRow[]).filter(
    (r) => slugifyCity(r.properties?.myr_city || r.properties?.city || "") === slug,
  );

  const known = isKnownCity(slug);
  const { data: all } = await db
    .from("rooms")
    .select("properties!inner(myr_city, city)")
    .eq("is_public", true)
    .eq("myr_available", true)
    .limit(2000);
  const otherCities = groupCities(
    ((all ?? []) as unknown as Array<{ properties: { myr_city: string | null; city: string | null } | null }>).map(
      (r) => r.properties?.myr_city || r.properties?.city,
    ),
  )
    .filter((c) => c.slug !== slug)
    .slice(0, 12);

  if (!rows.length && !known) return null; // unknown city with nothing listed: a real 404, not thin content

  const rents = rows.map((r) => Number(r.rent_amount)).filter((n) => Number.isFinite(n) && n > 0);
  const localities = [
    ...new Set(
      rows
        .map((r) => (r.properties?.myr_address || r.properties?.address || "").split(",")[0].trim())
        .filter((x) => x.length > 2 && x.length < 40),
    ),
  ].slice(0, 8);
  const types = [...new Set(rows.map((r) => r.properties?.property_type).filter((x): x is string => !!x))];

  return {
    slug,
    city,
    known,
    total: rows.length,
    minRent: rents.length ? Math.min(...rents) : null,
    maxRent: rents.length ? Math.max(...rents) : null,
    types,
    localities,
    rooms: rows.slice(0, 24).map((r) => ({
      id: r.id,
      title: `${r.properties?.name ?? "Room"} · Room ${r.room_number}`,
      rent: Number(r.rent_amount),
      type: r.properties?.property_type ?? null,
      locality: (r.properties?.myr_address || r.properties?.address || "").split(",")[0].trim() || null,
      cover: strArr(r.myr_photos)[0] ?? strArr(r.properties?.myr_cover_photos)[0] ?? null,
      amenities: strArr(r.myr_amenities).slice(0, 4),
    })),
    otherCities,
  };
}

export async function loadSitemapData() {
  const db = publicClient();
  const { data } = await db
    .from("rooms")
    .select("id, updated_at, properties!inner(myr_city, city)")
    .eq("is_public", true)
    .eq("myr_available", true)
    .order("updated_at", { ascending: false })
    .limit(5000);
  const rows = (data ?? []) as unknown as Array<{
    id: string;
    updated_at: string;
    properties: { myr_city: string | null; city: string | null } | null;
  }>;
  return {
    rooms: rows.map((r) => ({ id: r.id, updatedAt: r.updated_at })),
    cities: groupCities(rows.map((r) => r.properties?.myr_city || r.properties?.city)),
  };
}
