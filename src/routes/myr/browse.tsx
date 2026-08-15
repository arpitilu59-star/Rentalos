import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  MapPin,
  ShieldCheck,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  ChevronDown,
  X,
} from "lucide-react";
import { LiveFeedCover } from "@/components/LiveFeedCover";

type BrowseSearch = { city?: string; minRent?: number; maxRent?: number };

const RENT_MIN = 0;
const RENT_MAX = 50000;
const RENT_STEP = 500;

export const Route = createFileRoute("/myr/browse")({
  component: BrowsePage,
  validateSearch: (s: Record<string, unknown>): BrowseSearch => ({
    city: typeof s.city === "string" ? s.city : undefined,
    minRent:
      typeof s.minRent === "string"
        ? Number(s.minRent) || undefined
        : typeof s.minRent === "number"
          ? s.minRent
          : undefined,
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

/** Dual-handle budget slider — two overlapping native range inputs (no extra dependency). */
function BudgetSlider({
  min,
  max,
  onChange,
}: {
  min: number;
  max: number;
  onChange: (min: number, max: number) => void;
}) {
  const [localMin, setLocalMin] = useState(min);
  const [localMax, setLocalMax] = useState(max);

  useEffect(() => {
    setLocalMin(min);
    setLocalMax(max);
  }, [min, max]);

  const commit = (nMin: number, nMax: number) => {
    const safeMin = Math.min(nMin, nMax - RENT_STEP);
    const safeMax = Math.max(nMax, nMin + RENT_STEP);
    setLocalMin(safeMin);
    setLocalMax(safeMax);
    onChange(safeMin, safeMax);
  };

  const pctMin = ((localMin - RENT_MIN) / (RENT_MAX - RENT_MIN)) * 100;
  const pctMax = ((localMax - RENT_MIN) / (RENT_MAX - RENT_MIN)) * 100;

  return (
    <div className="px-1 pt-1 pb-2">
      <div className="flex items-center justify-between text-xs font-medium mb-2">
        <span>{formatINR(localMin)}</span>
        <span>
          {formatINR(localMax)}
          {localMax >= RENT_MAX ? "+" : ""}
        </span>
      </div>
      <div className="relative h-5">
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-1.5 rounded-full bg-muted" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-primary"
          style={{ left: `${pctMin}%`, right: `${100 - pctMax}%` }}
        />
        <input
          type="range"
          min={RENT_MIN}
          max={RENT_MAX}
          step={RENT_STEP}
          value={localMin}
          onChange={(e) => commit(Number(e.target.value), localMax)}
          className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background"
        />
        <input
          type="range"
          min={RENT_MIN}
          max={RENT_MAX}
          step={RENT_STEP}
          value={localMax}
          onChange={(e) => commit(localMin, Number(e.target.value))}
          className="absolute w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:shadow [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-primary [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background"
        />
      </div>
    </div>
  );
}

/** City picker — click to see all cities that actually have listings, instead of typing. */
function CityPicker({
  value,
  cities,
  onSelect,
}: {
  value: string;
  cities: string[];
  onSelect: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative col-span-2 md:col-span-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 pl-3 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm text-left"
      >
        <MapPin className="size-4 text-muted-foreground shrink-0" />
        <span className={value ? "" : "text-muted-foreground"}>{value || "Select city"}</span>
        <ChevronDown className="size-3.5 text-muted-foreground ml-auto shrink-0" />
        {value && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onSelect("");
            }}
            className="p-0.5 rounded hover:bg-accent"
          >
            <X className="size-3.5" />
          </span>
        )}
      </button>
      {open && (
        <div className="absolute z-40 mt-1 w-full max-h-64 overflow-y-auto rounded-xl bg-card border border-border shadow-elevated p-2 grid grid-cols-2 gap-1">
          {cities.length === 0 ? (
            <div className="col-span-2 text-xs text-muted-foreground p-2">Loading cities…</div>
          ) : (
            cities.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  onSelect(c);
                  setOpen(false);
                }}
                className={`text-left px-2.5 py-1.5 rounded-lg text-sm ${value === c ? "bg-primary text-primary-foreground" : "hover:bg-accent"}`}
              >
                {c}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function BrowsePage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const [items, setItems] = useState<PublicRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [allCities, setAllCities] = useState<string[]>([]);

  const [city, setCity] = useState(search.city || "");
  const [minRent, setMinRent] = useState(search.minRent ?? RENT_MIN);
  const [maxRent, setMaxRent] = useState(search.maxRent ?? RENT_MAX);

  // City list — fetched once, independent of current filters, so the picker always shows every city with listings.
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("properties")
        .select("myr_city, city")
        .eq("is_public_listing", true)
        .limit(300);
      const set = new Set<string>();
      (data ?? []).forEach((p: { myr_city: string | null; city: string | null }) => {
        const c = p.myr_city || p.city;
        if (c) set.add(c);
      });
      setAllCities(Array.from(set).sort());
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
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
      if (search.minRent) q = q.gte("rent_amount", search.minRent);
      if (search.maxRent && search.maxRent < RENT_MAX) q = q.lte("rent_amount", search.maxRent);

      const { data } = await q;
      setItems((data ?? []) as unknown as PublicRoom[]);
      setLoading(false);
    })();
  }, [search.city, search.minRent, search.maxRent]);

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    nav({
      search: {
        city: city || undefined,
        minRent: minRent > RENT_MIN ? minRent : undefined,
        maxRent: maxRent < RENT_MAX ? maxRent : undefined,
      },
    });
  };

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (city) n++;
    if (minRent > RENT_MIN || maxRent < RENT_MAX) n++;
    return n;
  }, [city, minRent, maxRent]);

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
          className="bg-card border border-border p-3 rounded-2xl shadow-card mb-2 space-y-3"
        >
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_auto] gap-2 items-start">
            <CityPicker value={city} cities={allCities} onSelect={(c) => setCity(c)} />

            <div className="col-span-2 md:col-span-1 rounded-xl border border-input bg-background px-3">
              <BudgetSlider
                min={minRent}
                max={maxRent}
                onChange={(a, b) => {
                  setMinRent(a);
                  setMaxRent(b);
                }}
              />
            </div>

            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium h-fit self-center"
            >
              <Search className="size-4" /> Search
            </button>
          </div>
        </form>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2 mb-6 text-xs text-muted-foreground">
            <SlidersHorizontal className="size-3.5" /> {activeFilterCount} filter
            {activeFilterCount > 1 ? "s" : ""} active
            <button
              type="button"
              onClick={() => {
                setCity("");
                setMinRent(RENT_MIN);
                setMaxRent(RENT_MAX);
                nav({ search: {} });
              }}
              className="underline hover:text-foreground"
            >
              Clear
            </button>
          </div>
        )}

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
