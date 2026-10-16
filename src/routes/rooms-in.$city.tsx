import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { getCityPage } from "@/lib/city-listing.functions";
import { KNOWN_CITIES, cityFromSlug, slugifyCity } from "@/lib/cities";
import { seo, jsonLd, breadcrumbSchema, SITE_URL } from "@/lib/seo";

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);

export const Route = createFileRoute("/rooms-in/$city")({
  loader: async ({ params }) => {
    const { page } = await getCityPage({ data: { slug: params.city } });
    if (!page) throw notFound();
    return page;
  },
  head: ({ loaderData, params }) => {
    const slug = slugifyCity(params.city);
    const name = loaderData?.city ?? cityFromSlug(slug) ?? "your city";
    const path = `/rooms-in/${slug}`;
    if (!loaderData) return seo({ title: `Rooms in ${name}`, description: "", path, noindex: true });
    const price =
      loaderData.minRent != null ? ` Rent from ${inr(loaderData.minRent)}/month.` : "";
    const description =
      loaderData.total > 0
        ? `${loaderData.total} room${loaderData.total > 1 ? "s" : ""} and PG${loaderData.total > 1 ? "s" : ""} available for rent in ${name}.${price} Talk directly to owners — no brokerage on Rentalos.`
        : `Find rooms, PGs and flats for rent in ${name} on Rentalos. Listings appear here as owners publish them — no brokerage.`;
    const base = seo({
      title: `Rooms & PGs for rent in ${name}`,
      description,
      path,
      // A city with nothing live is a thin page: keep it out of the index until it has listings.
      noindex: loaderData.total === 0,
    });
    const graph: Record<string, unknown>[] = [
      breadcrumbSchema([
        { name: "Home", path: "/" },
        { name: "Browse rentals", path: "/myr/browse" },
        { name: name, path },
      ]),
    ];
    if (loaderData.rooms.length)
      graph.push({
        "@context": "https://schema.org",
        "@type": "ItemList",
        name: `Rooms for rent in ${name}`,
        numberOfItems: loaderData.total,
        itemListElement: loaderData.rooms.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: `${SITE_URL}/myr/room/${r.id}`,
          name: r.title,
        })),
      });
    return { ...base, scripts: graph.map((g) => jsonLd(g).scripts[0]) };
  },
  notFoundComponent: () => (
    <div className="min-h-screen grid place-items-center bg-background px-4 text-center">
      <div>
        <h1 className="text-xl font-semibold">We don't have listings for this city yet</h1>
        <p className="text-sm text-muted-foreground mt-2">Browse rooms in other cities instead.</p>
        <Link to="/myr/browse" className="inline-block mt-4 text-primary font-medium hover:underline">
          Browse all rooms →
        </Link>
      </div>
    </div>
  ),
  component: CityPage,
});

function CityPage() {
  const d = Route.useLoaderData();
  const faq: Array<[string, string]> = [
    [
      `How do I find a room for rent in ${d.city}?`,
      `Browse the ${d.city} listings on this page, open a room to see photos, rent, deposit, amenities and the owner's rental terms, then send a booking request. You deal directly with the owner.`,
    ],
    [
      "Is there any brokerage on Rentalos?",
      "No. Rentalos connects tenants directly with property owners, so there is no broker commission.",
    ],
    [
      "What happens after I send a booking request?",
      "The owner reviews your request and accepts or rejects it. Before you send it you can read the owner's rental terms, which are saved with your request.",
    ],
  ];
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">M</div>
            <div className="font-semibold">RentalOS</div>
          </Link>
          <Link to="/myr/browse" className="px-3 py-1.5 rounded-md text-sm hover:bg-accent">
            All rooms
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        <nav aria-label="Breadcrumb" className="text-xs text-muted-foreground mb-3">
          <Link to="/" className="hover:underline">Home</Link> /{" "}
          <Link to="/myr/browse" className="hover:underline">Browse</Link> / {d.city}
        </nav>
        <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">
          Rooms &amp; PGs for rent in {d.city}
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
          {d.total > 0 ? (
            <>
              {d.total} room{d.total > 1 ? "s" : ""} available
              {d.minRent != null && d.maxRent != null && d.minRent !== d.maxRent
                ? `, from ${inr(d.minRent)} to ${inr(d.maxRent)} per month`
                : d.minRent != null
                  ? `, ${inr(d.minRent)} per month`
                  : ""}
              . Talk directly to owners — no brokerage.
            </>
          ) : (
            <>No rooms are live in {d.city} right now. Owners publish new rooms every day — check back soon.</>
          )}
        </p>

        {d.localities.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">Areas: {d.localities.join(" · ")}</p>
        )}

        {d.rooms.length > 0 ? (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {d.rooms.map((r) => (
              <Link
                key={r.id}
                to="/myr/room/$id"
                params={{ id: r.id }}
                className="rounded-2xl bg-card border border-border overflow-hidden hover:shadow-elevated transition"
              >
                {r.cover ? (
                  <img src={r.cover} alt={r.title} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                ) : (
                  <div className="aspect-[4/3] w-full bg-muted grid place-items-center text-xs text-muted-foreground">No photo</div>
                )}
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">{r.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        <MapPin className="size-3 inline -mt-0.5" /> {r.locality ? `${r.locality}, ` : ""}{d.city}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-semibold">{inr(r.rent)}</div>
                      <div className="text-[10px] text-muted-foreground">/ month</div>
                    </div>
                  </div>
                  {(r.type || r.amenities.length > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.type && <span className="text-[11px] rounded-full bg-primary/10 text-primary px-2 py-0.5 capitalize">{r.type}</span>}
                      {r.amenities.map((a) => (
                        <span key={a} className="text-[11px] rounded-full bg-muted px-2 py-0.5">{a}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-card p-6 text-sm">
            <Link to="/myr/browse" className="text-primary font-medium hover:underline">
              Browse rooms in other cities →
            </Link>
          </div>
        )}

        {d.total > d.rooms.length && (
          <div className="mt-5">
            <Link
              to="/myr/browse"
              search={{ city: d.city } as never}
              className="text-primary font-medium text-sm hover:underline"
            >
              See all {d.total} rooms in {d.city} →
            </Link>
          </div>
        )}

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Renting in {d.city}: common questions</h2>
          <div className="mt-3 space-y-3">
            {faq.map(([q, a]) => (
              <div key={q} className="rounded-xl border border-border bg-card p-4">
                <h3 className="text-sm font-medium">{q}</h3>
                <p className="text-sm text-muted-foreground mt-1">{a}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-10">
          <h2 className="text-lg font-semibold">Rooms in other cities</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {(d.otherCities.length
              ? d.otherCities.map((c) => ({ slug: c.slug, name: `${c.name} (${c.count})` }))
              : KNOWN_CITIES.filter((c) => slugifyCity(c) !== d.slug).slice(0, 12).map((c) => ({ slug: slugifyCity(c), name: c }))
            ).map((c) => (
              <Link
                key={c.slug}
                to="/rooms-in/$city"
                params={{ city: c.slug }}
                className="text-xs rounded-full border border-border px-3 py-1.5 hover:bg-accent"
              >
                {c.name}
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
