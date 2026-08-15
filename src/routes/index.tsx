import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import {
  Search,
  MapPin,
  ShieldCheck,
  Sparkles,
  Building2,
  Home,
  Users,
  Loader2,
  Linkedin,
} from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";
import { LiveFeedCover } from "@/components/LiveFeedCover";

export const Route = createFileRoute("/")({ component: MyrLanding });

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
              <span>Aap already signed in ho.</span>
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

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8 md:pt-16 md:pb-10 text-center">
        <motion.div {...fadeUp} transition={{ duration: 0.5 }}>
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
            <Sparkles className="size-3" /> Verified PGs, rooms & flats — no broker
          </div>
        </motion.div>

        <motion.h1
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.08 }}
          className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight"
        >
          Apna <span className="text-primary">naya ghar</span> dhundhein
        </motion.h1>

        <motion.p
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.14 }}
          className="mt-3 text-sm md:text-base text-muted-foreground max-w-xl mx-auto"
        >
          Bina login ke rooms browse karein. Book karte samay hi tenant login karein — direct
          landlord se connect.
        </motion.p>

        <motion.form
          {...fadeUp}
          transition={{ duration: 0.5, delay: 0.2 }}
          onSubmit={submitSearch}
          className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 max-w-xl mx-auto bg-card border border-border rounded-2xl p-2 shadow-card"
        >
          <div className="relative">
            <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="City (Delhi, Bangalore…)"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40"
            />
          </div>
          <motion.button
            whileHover={reduce ? undefined : { scale: 1.03 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
          >
            <Search className="size-4" /> Browse rooms
          </motion.button>
        </motion.form>

        <motion.div {...fadeUp} transition={{ duration: 0.5, delay: 0.26 }}>
          <Link
            to="/myr/roommates"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border mt-4 hover:bg-accent transition-colors"
          >
            <Users className="size-3.5" /> New: Find a roommate match →
          </Link>
        </motion.div>
      </section>

      {cities.length > 0 && (
        <motion.section
          {...fadeUpInView}
          transition={{ duration: 0.4 }}
          className="max-w-6xl mx-auto px-4 pb-6"
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <motion.button
              whileTap={reduce ? undefined : { scale: 0.95 }}
              onClick={() => setActiveCity(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${!activeCity ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
            >
              All cities
            </motion.button>
            {cities.map((c, i) => (
              <motion.button
                key={c}
                initial={reduce ? undefined : { opacity: 0, scale: 0.9 }}
                animate={reduce ? undefined : { opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                whileTap={reduce ? undefined : { scale: 0.95 }}
                onClick={() => setActiveCity(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${activeCity === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
              >
                {c}
              </motion.button>
            ))}
          </div>
        </motion.section>
      )}

      <section className="max-w-6xl mx-auto px-4 pb-14">
        {loadingRooms ? (
          <div className="py-12 grid place-items-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : visibleRooms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Abhi is city mein rooms nahi hain.{" "}
            <Link to="/myr/browse" className="text-primary font-medium">
              Sab rooms dekhein
            </Link>
            .
          </div>
        ) : (
          <>
            <motion.div
              {...fadeUpInView}
              transition={{ duration: 0.4 }}
              className="flex items-center justify-between mb-3"
            >
              <h2 className="text-lg font-semibold">
                {activeCity ? `Rooms in ${activeCity}` : "Popular rooms right now"}
              </h2>
              <Link to="/myr/browse" className="text-xs font-medium text-primary hover:underline">
                See all →
              </Link>
            </motion.div>
            <motion.div layout className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              <AnimatePresence mode="popLayout">
                {visibleRooms.map((r, i) => {
                  const photos = Array.isArray(r.myr_photos)
                    ? (r.myr_photos as string[])
                    : Array.isArray(r.properties?.myr_cover_photos)
                      ? (r.properties!.myr_cover_photos as string[])
                      : [];
                  const location = r.properties?.myr_city || r.properties?.city || "";
                  return (
                    <motion.div
                      key={r.id}
                      layout
                      initial={reduce ? undefined : { opacity: 0, y: 16 }}
                      animate={reduce ? undefined : { opacity: 1, y: 0 }}
                      exit={reduce ? undefined : { opacity: 0, scale: 0.95 }}
                      transition={{ duration: 0.35, delay: reduce ? 0 : Math.min(i, 8) * 0.04 }}
                      whileHover={reduce ? undefined : { y: -4 }}
                    >
                      <Link
                        to="/myr/room/$id"
                        params={{ id: r.id }}
                        className="block rounded-xl overflow-hidden bg-card border border-border hover:shadow-elevated transition-shadow"
                      >
                        <div className="relative">
                          <LiveFeedCover
                            target={{ kind: "room", id: r.id }}
                            fallback={photos[0]}
                            alt={r.properties?.name || undefined}
                            aspectClass="aspect-square"
                          />
                          {r.properties?.verification_status === "verified" && (
                            <div className="absolute top-1.5 left-1.5 inline-flex items-center gap-1 text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                              <ShieldCheck className="size-2.5" /> Verified
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-semibold truncate">
                            {formatINR(Number(r.rent_amount))}
                            <span className="text-muted-foreground font-normal">/mo</span>
                          </div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {location}
                          </div>
                        </div>
                      </Link>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </motion.div>
          </>
        )}
      </section>

      <motion.section
        {...fadeUpInView}
        transition={{ duration: 0.4 }}
        className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-muted-foreground"
      >
        <div className="flex items-center justify-center gap-6 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" /> Verified owners
          </span>
          <span className="inline-flex items-center gap-1">
            <Building2 className="size-3.5" /> Direct UPI payment
          </span>
          <span className="inline-flex items-center gap-1">
            <Home className="size-3.5" /> No brokerage
          </span>
        </div>
      </motion.section>

      <motion.section
        {...fadeUpInView}
        transition={{ duration: 0.5 }}
        className="border-t border-border bg-accent/40"
      >
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div>
            <div className="font-semibold text-lg">Property ka malik hain?</div>
            <p className="text-sm text-muted-foreground mt-1">
              Apni property list karein, rooms/tenants/bills RentDesk se manage karein —
              subscription plans sirf landlords ke liye.
            </p>
          </div>
          <motion.div
            whileHover={reduce ? undefined : { scale: 1.03 }}
            whileTap={reduce ? undefined : { scale: 0.97 }}
          >
            <Link
              to="/landlord/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 shrink-0"
            >
              <Building2 className="size-4" /> Landlord login / Signup
            </Link>
          </motion.div>
        </div>
      </motion.section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <span>© {new Date().getFullYear()} ManageYourRoom · Powered by RentDesk</span>
          <a
            href="https://www.linkedin.com/company/smartpg/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
          >
            <Linkedin className="size-3.5" /> LinkedIn
          </a>
        </div>
      </footer>
    </div>
  );
}
