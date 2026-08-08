import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  MapPin,
  ShieldCheck,
  Loader2,
  SlidersHorizontal,
  BedDouble,
  Sparkles,
} from "lucide-react";
import { LiveFeedCover } from "@/components/LiveFeedCover";

type BrowseSearch = { city?: string; maxRent?: number };

export const Route = createFileRoute("/myr/browse")({
  component: BrowsePage,
  validateSearch: (s: Record<string, unknown>): BrowseSearch => ({
    city: typeof s.city === "string" ? s.city : undefined,
    maxRent:
      typeof s.maxRent === "string"
        ? Number(s.maxRent) || undefined
        : typeof s.maxRent === "number"
          ? s.maxRent
          : undefined,
  }),
});

type PublicRoom = {
  id: string;
  room_number: string;
  rent_amount: number;
  myr_amenities: string[] | null;
  myr_description: string | null;
  myr_photos: unknown;
  properties: {
    id: string;
    name: string;
    myr_city: string | null;
    myr_address: string | null;
    city: string | null;
    address: string | null;
    property_type: string | null;
    myr_cover_photos: unknown;
  } | null;
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function BrowsePage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const [items, setItems] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState(search.city || "");
  const [maxRent, setMaxRent] = useState<string>(search.maxRent ? String(search.maxRent) : "");

  useEffect(() => {
    (async () => {
      setLoading(true);
      // Query RentDesk rooms table (single source of truth). RLS policy already filters to
      // is_public=true AND property is_public_listing=true AND verified.
      let q = supabase
        .from("rooms")
        .select(
          "id, room_number, rent_amount, myr_amenities, myr_description, myr_photos, properties!inner(id, name, myr_city, myr_address, city, address, property_type, myr_cover_photos, is_public_listing, verification_status)",
        )
        .eq("is_public", true)
        .eq("myr_available", true)
        .limit(80);

      if (search.city)
        q = q.or(`myr_city.ilike.%${search.city}%,city.ilike.%${search.city}%`, {
          foreignTable: "properties",
        });
      if (search.maxRent) q = q.lte("rent_amount", search.maxRent);

      const { data } = await q;
      setItems((data ?? []) as unknown as PublicRoom[]);
      setLoading(false);
    })();
  }, [search.city, search.maxRent]);

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ search: { city: city || undefined, maxRent: maxRent ? Number(maxRent) : undefined } });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
              M
            </div>
            <div className="font-semibold">ManageYourRoom</div>
          </Link>
          <div className="flex items-center gap-2 text-sm">
            <Link to="/tenant" className="px-3 py-1.5 rounded-md hover:bg-accent">
              Tenant
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6">
        <Link
          to="/myr/roommates"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full bg-accent text-accent-foreground mb-4 hover:opacity-90"
        >
          <Sparkles className="size-3" /> New: Find a roommate match →
        </Link>

        <form
          onSubmit={apply}
          className="grid grid-cols-2 md:grid-cols-[1fr_160px_auto] gap-2 mb-6 bg-card border border-border p-2 rounded-2xl shadow-card"
        >
          <div className="relative col-span-2 md:col-span-1">
            <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40"
            />
          </div>
          <input
            value={maxRent}
            onChange={(e) => setMaxRent(e.target.value)}
            placeholder="Max rent"
            inputMode="numeric"
            className="px-3 py-2.5 rounded-xl bg-background border border-input text-sm"
          />
          <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
            <Search className="size-4" /> Search
          </button>
        </form>

        {loading ? (
          <div className="py-20 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            <SlidersHorizontal className="size-8 mx-auto mb-2 opacity-50" />
            Koi room nahi mila. Filter badal ke try karein.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((r) => {
              const photos = Array.isArray(r.myr_photos)
                ? (r.myr_photos as string[])
                : Array.isArray(r.properties?.myr_cover_photos)
                  ? (r.properties!.myr_cover_photos as string[])
                  : [];
              const cover = photos[0];
              const location =
                r.properties?.myr_city ||
                r.properties?.city ||
                r.properties?.myr_address ||
                r.properties?.address ||
                "—";
              return (
                <Link
                  key={r.id}
                  to="/myr/room/$id"
                  params={{ id: r.id }}
                  className="group rounded-2xl bg-card border border-border overflow-hidden hover:shadow-elevated transition"
                >
                  <LiveFeedCover
                    target={{ kind: "room", id: r.id }}
                    fallback={cover}
                    alt={r.properties?.name || undefined}
                    aspectClass="aspect-[4/5]"
                    showPendingState
                  />
                  <div className="relative">
                    {r.properties?.property_type && (
                      <div className="absolute -top-8 left-2 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-primary text-primary-foreground capitalize">
                        {r.properties.property_type}
                      </div>
                    )}
                    <div className="absolute -top-8 right-2 inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-background/90 backdrop-blur">
                      <ShieldCheck className="size-3 text-primary" /> Verified
                    </div>
                  </div>
                  <div className="p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold truncate">
                          {r.properties?.name ?? "Property"} · Room {r.room_number}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          <MapPin className="size-3 inline -mt-0.5" /> {location}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-semibold">{formatINR(Number(r.rent_amount))}</div>
                        <div className="text-[10px] text-muted-foreground">/ month</div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
