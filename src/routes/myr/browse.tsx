import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TermsSchema } from "@/lib/terms/schema";
import { evaluate, activeFilterCount, type TermsFilters } from "@/lib/terms/match";
import { TermsFilterDrawer } from "@/components/terms/TermsFilterDrawer";
import { CompletenessBadge } from "@/components/terms/TermsView";
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
import { OCCUPANT_TYPES, OCCUPANT_LABEL, ROOM_SIZES, ROOM_SIZE_LABEL, roomProfileLabel } from "@/lib/room-profile";
import { LiveFeedCover } from "@/components/LiveFeedCover";
import { seo } from "@/lib/seo";
import { groupCities, slugifyCity } from "@/lib/cities";
import {
  PAGE_SIZE,
  PROPERTY_TYPES,
  RENT_MAX,
  RENT_MIN,
  RENT_STEP,
  activeBrowseFilters,
  cityOrFilter,
  fetchLimit,
  parseBrowseSearch,
  textOrFilter,
  type BrowseSearch,
  type Sort,
} from "@/lib/browse-filters";

export const Route = createFileRoute("/myr/browse")({
  component: BrowsePage,
  validateSearch: (s: Record<string, unknown>): BrowseSearch => parseBrowseSearch(s),
  head: ({ match }) => {
    const sp = match.search as BrowseSearch;
    const city = sp?.city;
    // Filtered URLs all point search engines at one canonical page: the city page, or the main list.
    const path = city ? `/rooms-in/${slugifyCity(city)}` : "/myr/browse";
    return seo({
      title: city ? `Rooms & PGs for rent in ${city}` : "Browse rooms & rental properties",
      description: city
        ? `Find verified rooms, PGs and rental properties in ${city}. Compare rent, deposit and amenities, and connect directly with owners — no brokerage on Rentalos.`
        : "Browse verified rooms, PGs and rental properties across India. Filter by city and budget, and connect directly with property owners — no brokerage.",
      path,
    });
  },
});

type PublicRoom = {
  id: string;
  room_number: string;
  rent_amount: number;
  occupant_type?: string | null;
  room_size?: string | null;
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
    terms_summary?: unknown;
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

const SORT_LABEL: Record<Sort, string> = {
  newest: "Newest first",
  rent_asc: "Rent: low to high",
  rent_desc: "Rent: high to low",
};

function BrowsePage() {
  const search = Route.useSearch();
  const nav = Route.useNavigate();
  const [items, setItems] = useState<PublicRoom[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [allCities, setAllCities] = useState<string[]>([]);
  const reqId = useRef(0);

  // Draft values for the Search form; the URL is the single source of truth once applied.
  const [city, setCity] = useState(search.city ?? "");
  const [text, setText] = useState(search.q ?? "");
  const [minRent, setMinRent] = useState(search.minRent ?? RENT_MIN);
  const [maxRent, setMaxRent] = useState(search.maxRent ?? RENT_MAX);
  useEffect(() => {
    setCity(search.city ?? "");
    setText(search.q ?? "");
    setMinRent(search.minRent ?? RENT_MIN);
    setMaxRent(search.maxRent ?? RENT_MAX);
  }, [search.city, search.q, search.minRent, search.maxRent]);

  const termsFilters: TermsFilters = search.tf ?? {};
  const termsActive = activeFilterCount(termsFilters);

  const update = useCallback(
    (patch: Partial<BrowseSearch>) =>
      nav({
        search: (prev: BrowseSearch) => parseBrowseSearch({ ...prev, pages: undefined, ...patch }),
        replace: true,
      }),
    [nav],
  );

  // Cities that actually have bookable rooms right now (one entry per city, any capitalisation).
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("rooms")
        .select("properties!inner(myr_city, city)")
        .eq("is_public", true)
        .eq("myr_available", true)
        .limit(1000);
      setAllCities(
        groupCities(
          (
            (data ?? []) as unknown as Array<{
              properties: { myr_city: string | null; city: string | null } | null;
            }>
          ).map((r) => r.properties?.myr_city || r.properties?.city),
        ).map((c) => c.name),
      );
    })();
  }, []);

  const fetchKey = JSON.stringify([
    search.city,
    search.q,
    search.minRent,
    search.maxRent,
    search.type,
    search.occ,
    search.size,
    search.sort,
    search.pages,
    termsActive > 0,
  ]);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const id = ++reqId.current;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        let q = supabase
          .from("rooms")
          .select(
            "id, room_number, rent_amount, occupant_type, room_size, myr_amenities, myr_description, myr_photos, properties!inner(id, name, myr_city, myr_address, city, address, property_type, myr_cover_photos, is_public_listing, verification_status, terms_summary)",
            { count: "exact" },
          )
          .eq("is_public", true)
          .eq("myr_available", true);
        if (search.city) q = q.or(cityOrFilter(search.city), { foreignTable: "properties" });
        if (search.q) q = q.or(textOrFilter(search.q), { foreignTable: "properties" });
        if (search.type) q = q.eq("properties.property_type", search.type);
        if (search.occ) q = q.in("occupant_type", [search.occ, "anyone"]);
        if (search.size) q = q.eq("room_size", search.size);
        if (search.minRent !== undefined) q = q.gte("rent_amount", search.minRent);
        if (search.maxRent !== undefined) q = q.lte("rent_amount", search.maxRent);
        if (search.sort === "rent_asc") q = q.order("rent_amount", { ascending: true });
        else if (search.sort === "rent_desc") q = q.order("rent_amount", { ascending: false });
        else q = q.order("created_at", { ascending: false });
        q = q.order("id").limit(fetchLimit(search, termsActive > 0));
        const { data, error: err, count } = await q;
        if (id !== reqId.current) return; // a newer search superseded this one
        if (err) throw new Error(err.message);
        setItems((data ?? []) as unknown as PublicRoom[]);
        setTotal(count ?? null);
      } catch (e) {
        if (id !== reqId.current) return;
        console.error("[browse] load failed:", e instanceof Error ? e.message : e);
        setError("Couldn't load rooms. Check your connection and try again.");
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchKey captures every input
  }, [fetchKey, retry]);

  const apply = (e?: React.FormEvent) => {
    e?.preventDefault();
    update({
      city: city.trim() || undefined,
      q: text.trim() || undefined,
      minRent: minRent > RENT_MIN ? minRent : undefined,
      maxRent: maxRent < RENT_MAX ? maxRent : undefined,
    });
  };

  // Deterministic filtering on the landlord's stated terms. Each card gets the reasons it matched.
  const evaluated = useMemo(
    () =>
      items.map((r) => {
        const parsed = r.properties?.terms_summary
          ? TermsSchema.safeParse(r.properties.terms_summary)
          : null;
        const terms = parsed?.success ? parsed.data : null;
        return { room: r, terms, ev: evaluate(terms, termsFilters) };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- termsFilters is derived from search.tf
    [items, search.tf],
  );
  const visible = evaluated.filter((x) => x.ev.include);
  const hiddenByTerms = items.length - visible.length;
  const filterCount = activeBrowseFilters(search, termsActive);
  const canLoadMore = termsActive === 0 && total !== null && items.length < total;

  const clearAll = () => {
    setCity("");
    setText("");
    setMinRent(RENT_MIN);
    setMaxRent(RENT_MAX);
    nav({ search: {} as never, replace: true });
  };

  const chip = (on: boolean) =>
    `px-3 py-1.5 rounded-full text-xs border transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
              M
            </div>
            <div className="font-semibold">RentalOS</div>
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
          className="bg-card border border-border p-3 rounded-2xl shadow-card mb-3 space-y-3"
        >
          <div className="grid grid-cols-2 md:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-start">
            <CityPicker value={city} cities={allCities} onSelect={(c) => setCity(c)} />

            <div className="col-span-2 md:col-span-1 relative">
              <Search className="size-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Area or property name"
                maxLength={60}
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40"
              />
            </div>

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
              className="col-span-2 md:col-span-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium h-fit self-center"
            >
              <Search className="size-4" /> Search
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => update({ type: undefined })}
              className={chip(!search.type)}
            >
              All types
            </button>
            {PROPERTY_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => update({ type: search.type === t ? undefined : t })}
                className={`${chip(search.type === t)} capitalize`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground mr-1">For</span>
            {OCCUPANT_TYPES.filter((o) => o !== "anyone").map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => update({ occ: search.occ === o ? undefined : o })}
                className={chip(search.occ === o)}
              >
                {OCCUPANT_LABEL[o]}
              </button>
            ))}
            <span className="text-xs text-muted-foreground ml-2 mr-1">Size</span>
            {ROOM_SIZES.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => update({ size: search.size === z ? undefined : z })}
                className={chip(search.size === z)}
              >
                {ROOM_SIZE_LABEL[z]}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <TermsFilterDrawer
              value={{ includeUnknown: true, ...termsFilters }}
              onChange={(f) => update({ tf: f })}
            />
            <label className="text-xs text-muted-foreground inline-flex items-center gap-2">
              Sort
              <select
                value={search.sort ?? "newest"}
                onChange={(e) => update({ sort: e.target.value as Sort })}
                className="px-2.5 py-1.5 rounded-lg bg-background border border-input text-xs text-foreground"
              >
                {(Object.keys(SORT_LABEL) as Sort[]).map((k) => (
                  <option key={k} value={k}>
                    {SORT_LABEL[k]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </form>

        <div
          className="flex flex-wrap items-center gap-2 mb-5 text-xs text-muted-foreground"
          aria-live="polite"
        >
          {!loading && !error && (
            <span>
              {termsActive > 0
                ? `${visible.length} of ${items.length} rooms match your terms`
                : total !== null
                  ? `${total} room${total === 1 ? "" : "s"} found`
                  : `${visible.length} rooms`}
            </span>
          )}
          {filterCount > 0 && (
            <>
              <SlidersHorizontal className="size-3.5" /> {filterCount} filter
              {filterCount > 1 ? "s" : ""} active
              <button type="button" onClick={clearAll} className="underline hover:text-foreground">
                Clear all
              </button>
            </>
          )}
          {termsActive > 0 && hiddenByTerms > 0 && (
            <span>· {hiddenByTerms} hidden by terms filters</span>
          )}
        </div>

        {loading ? (
          <div className="py-20 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="py-16 text-center text-sm">
            <p className="text-destructive">{error}</p>
            <button
              type="button"
              onClick={() => setRetry((n) => n + 1)}
              className="mt-3 px-4 py-2 rounded-lg border border-border hover:bg-accent"
            >
              Try again
            </button>
          </div>
        ) : visible.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            <SlidersHorizontal className="size-8 mx-auto mb-2 opacity-50" />
            <p>No rooms match these filters.</p>
            {filterCount > 0 && (
              <button
                type="button"
                onClick={clearAll}
                className="mt-3 text-primary font-medium hover:underline"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map(({ room: r, terms, ev }) => {
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
                      expandOnClick={false}
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
                      {roomProfileLabel(r) && (
                        <div className="mb-1 text-[11px] font-medium text-primary">{roomProfileLabel(r)}</div>
                      )}
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
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        <CompletenessBadge terms={terms} />
                        {ev.score !== null && (
                          <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5">
                            {ev.score}% match to your filters
                          </span>
                        )}
                      </div>
                      {ev.reasons.length > 0 && (
                        <ul className="mt-2 space-y-0.5 text-[11px]">
                          {ev.reasons.slice(0, 5).map((x) => (
                            <li
                              key={x.text}
                              className={
                                x.ok === true
                                  ? "text-emerald-700 dark:text-emerald-400"
                                  : x.ok === false
                                    ? "text-destructive"
                                    : "text-muted-foreground italic"
                              }
                            >
                              {x.ok === true ? "✓" : x.ok === false ? "✕" : "?"} {x.text}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
            {canLoadMore && (
              <div className="mt-6 text-center">
                <button
                  type="button"
                  onClick={() => update({ pages: (search.pages ?? 1) + 1 })}
                  className="px-5 py-2.5 rounded-xl border border-border text-sm hover:bg-accent"
                >
                  Show more rooms ({items.length} of {total})
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
