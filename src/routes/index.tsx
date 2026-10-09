import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { seo, organizationSchema, websiteSchema } from "@/lib/seo";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  MapPin,
  ShieldCheck,
  Building2,
  Users,
  Linkedin,
  AlertTriangle,
  CalendarClock,
  Bell,
  ArrowRight,
  IndianRupee,
  Check,
  Wrench,
  FileText,
} from "lucide-react";
import { PLANS, formatPlanPrice } from "@/lib/pricing";
import { SiteNavbar } from "@/components/SiteNavbar";
import { LiveFeedCover } from "@/components/LiveFeedCover";

export const Route = createFileRoute("/")({
  component: MyrLanding,
  head: () => {
    const base = seo({
      title: "RentalOS — The smarter way to rent, manage and live.",
      description:
        "Discover verified rooms and rental properties across India with no brokerage. Landlords get RentDesk to manage rent, tenants, bills, deposits and maintenance in one place.",
      path: "/",
    });
    return {
      ...base,
      scripts: [
        { type: "application/ld+json", children: JSON.stringify(organizationSchema()) },
        { type: "application/ld+json", children: JSON.stringify(websiteSchema()) },
      ],
    };
  },
});

type PublicRoom = {
  id: string;
  room_number: string;
  rent_amount: number;
  myr_photos: unknown;
  properties: {
    name: string;
    myr_city: string | null;
    city: string | null;
    myr_cover_photos: unknown;
    verification_status: string | null;
  } | null;
};

const formatINR = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n);

function MyrLanding() {
  const nav = useNavigate();
  const reduce = useReducedMotion();
  const [city, setCity] = useState("");
  const [myRole, setMyRole] = useState<"landlord" | "tenant" | null>(null);

  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [activeCity, setActiveCity] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("primary_role")
        .eq("id", session.user.id)
        .maybeSingle();
      if (prof?.primary_role === "landlord" || prof?.primary_role === "tenant")
        setMyRole(prof.primary_role);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingRooms(true);
      const { data } = await supabase
        .from("rooms")
        .select(
          "id, room_number, rent_amount, myr_photos, properties!inner(name, myr_city, city, myr_cover_photos, is_public_listing, verification_status)",
        )
        .eq("is_public", true)
        .eq("myr_available", true)
        .limit(60);
      setRooms((data ?? []) as unknown as PublicRoom[]);
      setLoadingRooms(false);
    })();
  }, []);

  const cities = useMemo(() => {
    const set = new Set<string>();
    rooms.forEach((r) => {
      const c = r.properties?.myr_city || r.properties?.city;
      if (c) set.add(c);
    });
    return Array.from(set).slice(0, 8);
  }, [rooms]);

  const visibleRooms = useMemo(() => {
    const filtered = activeCity
      ? rooms.filter((r) => (r.properties?.myr_city || r.properties?.city) === activeCity)
      : rooms;
    return filtered.slice(0, 8);
  }, [rooms, activeCity]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ to: "/myr/browse", search: { city: city || undefined } as never });
  };

  // Shared, reduced-motion-aware variants
  const fadeUp = reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 } };
  const fadeUpInView = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, margin: "-60px" },
      };

  const STEPS = [
    { k: "Discover", d: "Watch real room videos", to: "/myr/browse" },
    { k: "Connect", d: "Talk to the landlord directly", to: "/myr/browse" },
    { k: "Book", d: "Request a room, no broker", to: "/myr/browse" },
    { k: "Live", d: "Your rent, terms and room in one place", to: "/tenant/login" },
    { k: "Pay", d: "Clear bills with due dates", to: "/tenant/login" },
    { k: "Maintain", d: "Raise and track issues", to: "/tenant/login" },
    { k: "Manage", d: "RentDesk for landlords", to: "/landlord/login" },
    { k: "Move", d: "Move-out records and deposit", to: "/landlord/login" },
  ] as const;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />

      <AnimatePresence>
        {myRole && (
          <motion.div
            initial={reduce ? undefined : { height: 0, opacity: 0 }}
            animate={reduce ? undefined : { height: "auto", opacity: 1 }}
            exit={reduce ? undefined : { height: 0, opacity: 0 }}
            className="bg-accent/60 border-b border-border overflow-hidden"
          >
            <div className="max-w-6xl mx-auto px-4 py-2 text-sm flex items-center justify-between">
              <span>You're already signed in.</span>
              <Link
                to={myRole === "landlord" ? "/rentdesk" : "/tenant"}
                className="font-medium text-primary hover:underline"
              >
                Go to Dashboard →
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HERO */}
      <section className="max-w-6xl mx-auto px-4 pt-12 pb-10 md:pt-16 md:pb-12 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 items-center">
        <div>
          <motion.h1
            {...fadeUp}
            transition={{ duration: 0.5 }}
            className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.1]"
          >
            The smarter way to <span className="text-primary">rent, manage and live.</span>
          </motion.h1>
          <motion.p
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.08 }}
            className="mt-4 text-base text-muted-foreground max-w-lg"
          >
            Find your next place. Manage your rental. Stay connected. RentalOS joins rental
            discovery with rent, bills, meter readings and maintenance — so renting stays simple for
            tenants and landlords.
          </motion.p>

          <motion.form
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.14 }}
            onSubmit={submitSearch}
            role="search"
            className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 max-w-lg bg-card border border-border rounded-2xl p-2 shadow-card"
          >
            <div className="relative">
              <MapPin
                className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <label htmlFor="hero-city" className="sr-only">
                City or locality
              </label>
              <input
                id="hero-city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="City or locality (e.g. Jaipur, Mansarovar)"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40"
              />
            </div>
            <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 ring-ring/60">
              <Search className="size-4" /> Explore Rentals
            </button>
          </motion.form>

          <motion.div
            {...fadeUp}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mt-4 flex flex-wrap items-center gap-3 text-sm"
          >
            <Link
              to="/landlord/login"
              className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
            >
              Manage with RentDesk <ArrowRight className="size-3.5" />
            </Link>
            <span className="text-border">|</span>
            <Link
              to="/myr/roommates"
              className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <Users className="size-3.5" /> Find a roommate match
            </Link>
          </motion.div>
        </div>

        {/* Hero visual = real marketplace cards with video previews */}
        <div aria-label="Latest rooms" className="grid grid-cols-2 gap-3">
          {loadingRooms
            ? [0, 1].map((i) => (
                <div key={i} className="aspect-[4/5] rounded-2xl bg-muted animate-pulse" />
              ))
            : visibleRooms.slice(0, 2).map((r) => <RoomCard key={r.id} r={r} compact />)}
          {!loadingRooms && visibleRooms.length === 0 && (
            <div className="col-span-2 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No rooms are published yet. Listings appear here as soon as landlords publish them.
            </div>
          )}
        </div>
      </section>

      {/* ONE PLATFORM / HOW IT WORKS */}
      <section id="how-it-works" className="border-y border-border bg-card/50 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
            One platform for the whole rental life.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            From finding a room to moving out, every step lives in one place.
          </p>
          <ol className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3">
            {STEPS.map((st, i) => (
              <li key={st.k}>
                <Link
                  to={st.to}
                  className="block h-full rounded-xl border border-border bg-card p-4 hover:shadow-elevated hover:-translate-y-0.5 transition focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
                >
                  <div className="text-[10px] font-semibold text-primary tracking-widest">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                  <div className="mt-1 font-semibold">{st.k}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{st.d}</div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* EVERYTHING IN ONE PLACE */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-center">
          Everything you need in one place.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground text-center max-w-xl mx-auto">
          From rent collection to maintenance, RentalOS keeps both sides of a rental connected.
        </p>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            {
              t: "Rent & bills",
              d: "Generate bills with clear billing periods and due dates.",
              i: IndianRupee,
            },
            {
              t: "Meter readings",
              d: "Photo + AI reading, checked against the previous reading.",
              i: AlertTriangle,
            },
            {
              t: "Maintenance",
              d: "Tenants raise issues, landlords track them to done.",
              i: Wrench,
            },
            { t: "Tenant communication", d: "Updates and reminders in the app.", i: Bell },
            {
              t: "Verified listings",
              d: "Rooms with live-recorded video, checked by RentalOS.",
              i: ShieldCheck,
            },
            {
              t: "Rental terms",
              d: "Deposit, parking and rules visible before you book.",
              i: FileText,
            },
          ].map((f) => (
            <div key={f.t} className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="size-9 rounded-lg bg-accent text-accent-foreground grid place-items-center">
                <f.i className="size-4" aria-hidden />
              </div>
              <div className="mt-3 font-semibold">{f.t}</div>
              <p className="text-sm text-muted-foreground mt-1">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* MARKETPLACE */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-end justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Find a place that fits your life.
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              See the room before you visit it — every card plays a short live preview.
            </p>
          </div>
          <Link to="/myr/browse" className="text-sm font-medium text-primary hover:underline">
            See all rooms →
          </Link>
        </div>

        {cities.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter by city">
            <button
              onClick={() => setActiveCity(null)}
              aria-pressed={!activeCity}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!activeCity ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
            >
              All cities
            </button>
            {cities.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCity(c)}
                aria-pressed={activeCity === c}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeCity === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {loadingRooms ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="rounded-2xl border border-border overflow-hidden">
                <div className="aspect-[4/5] bg-muted animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-1/2 bg-muted rounded animate-pulse" />
                  <div className="h-3 w-2/3 bg-muted rounded animate-pulse" />
                </div>
              </div>
            ))
          ) : visibleRooms.length === 0 ? (
            <div className="col-span-full rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No rooms in this city yet.{" "}
              <Link to="/myr/browse" className="text-primary font-medium">
                Browse all rooms
              </Link>
              .
            </div>
          ) : (
            visibleRooms.map((r) => <RoomCard key={r.id} r={r} />)
          )}
        </div>
      </section>

      {/* RENTDESK SHOWCASE — illustrative UI, clearly labelled */}
      <section id="rentdesk" className="border-y border-border bg-accent/30 scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight max-w-2xl">
            RentDesk catches mistakes before they become billing problems.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground max-w-xl">
            For landlords: RentalOS tells you what needs your attention and checks every meter
            reading for you.
          </p>
          <div className="mt-6 grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="text-xs font-medium text-muted-foreground">
                Room 204 · New meter reading
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-muted p-3">
                  <div className="text-[11px] text-muted-foreground">Previous reading</div>
                  <div className="text-xl font-semibold tabular-nums">1,245</div>
                </div>
                <div className="rounded-xl bg-destructive/10 p-3">
                  <div className="text-[11px] text-muted-foreground">New reading</div>
                  <div className="text-xl font-semibold tabular-nums text-destructive">1,180</div>
                </div>
              </div>
              <div
                className="mt-3 flex items-start gap-2 rounded-xl border border-warning/50 bg-warning/15 p-3 text-sm"
                role="status"
              >
                <AlertTriangle className="size-4 mt-0.5 shrink-0" aria-hidden />
                <span>
                  This reading is lower than the previous accepted reading of 1,245. Check the meter
                  photo or the room.
                </span>
              </div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium">
                  Review Reading
                </span>
                <span className="px-3 py-1.5 rounded-lg border border-border">Re-upload Photo</span>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-card p-5 shadow-card">
              <div className="text-xs font-medium text-muted-foreground">
                Today · 3 things need your attention
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li className="flex items-center gap-3 rounded-xl bg-muted p-3">
                  <CalendarClock className="size-4 text-primary shrink-0" aria-hidden />
                  <span>A tenant's rental period ends in 7 days.</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-muted p-3">
                  <IndianRupee className="size-4 text-primary shrink-0" aria-hidden />
                  <span>Billing period 05 Oct → 05 Nov · 80 units</span>
                </li>
                <li className="flex items-center gap-3 rounded-xl bg-muted p-3">
                  <Bell className="size-4 text-primary shrink-0" aria-hidden />
                  <span>Reminders are scheduled automatically.</span>
                </li>
              </ul>
              <div className="mt-3 inline-flex px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium">
                Review &amp; Prepare Next Bill
              </div>
            </div>
          </div>
          <p className="mt-3 text-[11px] text-muted-foreground">
            Illustration of RentDesk with sample numbers.
          </p>
        </div>
      </section>

      {/* PRICING */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">
          Pay for the software. Not your rent.
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tenants use RentalOS free. Plans are for landlords, societies and property managers.
        </p>
        <div className="mt-6 grid md:grid-cols-3 gap-4">
          {PLANS.map((p) => (
            <div
              key={p.id}
              className={`rounded-2xl border p-5 ${p.highlighted ? "border-primary bg-primary/5" : "border-border bg-card"}`}
            >
              <div className="font-semibold">{p.name}</div>
              <div className="mt-2 text-2xl font-semibold tracking-tight">{formatPlanPrice(p)}</div>
              <p className="text-xs text-muted-foreground mt-1">{p.tagline}</p>
              <ul className="mt-3 space-y-1.5 text-sm">
                {p.features.slice(0, 3).map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-4 text-primary shrink-0 mt-0.5" aria-hidden />
                    <span className="text-muted-foreground">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-4">
          <Link to="/pricing" className="text-sm font-medium text-primary hover:underline">
            Compare all plans →
          </Link>
        </div>
      </section>

      {/* LANDLORD CTA */}
      <section className="border-t border-border bg-accent/40">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div>
            <div className="font-semibold text-lg">Own a property?</div>
            <p className="text-sm text-muted-foreground mt-1">
              List it, invite your tenants and run rent, bills and maintenance from RentDesk.
            </p>
          </div>
          <Link
            to="/landlord/login"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0"
          >
            <Building2 className="size-4" /> Landlord login / Signup
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-[1.2fr_2fr] gap-6 text-sm">
          <div>
            <div className="font-semibold">RentalOS</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              Rental discovery and rental management, together.
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs text-muted-foreground"
          >
            <Link to="/myr/browse" className="hover:text-foreground">
              Find Rentals
            </Link>
            <a href="/#rentdesk" className="hover:text-foreground">
              RentDesk
            </a>
            <Link to="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <a href="/#how-it-works" className="hover:text-foreground">
              How It Works
            </a>
            <Link to="/about" className="hover:text-foreground">
              About
            </Link>
            <Link to="/contact" className="hover:text-foreground">
              Contact
            </Link>
            <a
              href="https://www.linkedin.com/company/smartpg/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 hover:text-foreground"
            >
              <Linkedin className="size-3.5" /> LinkedIn
            </a>
          </nav>
        </div>
        <div className="border-t border-border py-4 text-center text-[11px] text-muted-foreground">
          © {new Date().getFullYear()} RentalOS · Powered by RentDesk
        </div>
      </footer>
    </div>
  );
}

function RoomCard({ r, compact = false }: { r: PublicRoom; compact?: boolean }) {
  const photos = Array.isArray(r.myr_photos)
    ? (r.myr_photos as string[])
    : Array.isArray(r.properties?.myr_cover_photos)
      ? (r.properties!.myr_cover_photos as string[])
      : [];
  const location = r.properties?.myr_city || r.properties?.city || "";
  return (
    <Link
      to="/myr/room/$id"
      params={{ id: r.id }}
      className="group block rounded-2xl overflow-hidden bg-card border border-border hover:shadow-elevated transition-shadow focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
    >
      <div className="relative">
        <LiveFeedCover
          target={{ kind: "room", id: r.id }}
          fallback={photos[0]}
          alt={r.properties?.name || undefined}
          aspectClass="aspect-[4/5]"
          expandOnClick={false}
        />
        {r.properties?.verification_status === "verified" && (
          <div className="absolute top-2 right-2 inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary text-primary-foreground">
            <ShieldCheck className="size-3" /> Verified
          </div>
        )}
      </div>
      <div className={compact ? "p-2.5" : "p-3"}>
        <div className="font-semibold">
          {formatINR(Number(r.rent_amount))}
          <span className="text-muted-foreground font-normal text-xs">/month</span>
        </div>
        <div className="text-xs text-muted-foreground truncate mt-0.5">
          <MapPin className="size-3 inline -mt-0.5" aria-hidden />{" "}
          {location || "Location on request"}
        </div>
        {!compact && (
          <div className="mt-2 text-xs font-medium text-primary group-hover:underline">
            View Room →
          </div>
        )}
      </div>
    </Link>
  );
}
