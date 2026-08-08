import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  const [city, setCity] = useState("");
  const [myRole, setMyRole] = useState<"landlord" | "tenant" | null>(null);

  const [rooms, setRooms] = useState<PublicRoom[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [activeCity, setActiveCity] = useState<string | null>(null);

  // Detect signed-in role without force-navigating (fixes the old bug
  // where a logged-in tenant/landlord could never browse the home page
  // without signing out first).
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

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />

      {myRole && (
        <div className="bg-accent/60 border-b border-border">
          <div className="max-w-6xl mx-auto px-4 py-2 text-sm flex items-center justify-between">
            <span>Aap already signed in ho.</span>
            <Link
              to={myRole === "landlord" ? "/rentdesk" : "/tenant"}
              className="font-medium text-primary hover:underline"
            >
              Go to Dashboard →
            </Link>
          </div>
        </div>
      )}

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8 md:pt-16 md:pb-10 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
          <Sparkles className="size-3" /> Verified PGs, rooms & flats — no broker
        </div>
        <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">
          Apna <span className="text-primary">naya ghar</span> dhundhein
        </h1>
        <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
          Bina login ke rooms browse karein. Book karte samay hi tenant login karein — direct
          landlord se connect.
        </p>

        <form
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
          <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Search className="size-4" /> Browse rooms
          </button>
        </form>

        <Link
          to="/myr/roommates"
          className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border mt-4 hover:bg-accent"
        >
          <Users className="size-3.5" /> New: Find a roommate match →
        </Link>
      </section>

      {/* City pills — dynamic, from actual listed rooms */}
      {cities.length > 0 && (
        <section className="max-w-6xl mx-auto px-4 pb-6">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              onClick={() => setActiveCity(null)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${!activeCity ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
            >
              All cities
            </button>
            {cities.map((c) => (
              <button
                key={c}
                onClick={() => setActiveCity(c)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${activeCity === c ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Live room feed */}
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">
                {activeCity ? `Rooms in ${activeCity}` : "Popular rooms right now"}
              </h2>
              <Link to="/myr/browse" className="text-xs font-medium text-primary hover:underline">
                See all →
              </Link>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {visibleRooms.map((r) => {
                const photos = Array.isArray(r.myr_photos)
                  ? (r.myr_photos as string[])
                  : Array.isArray(r.properties?.myr_cover_photos)
                    ? (r.properties!.myr_cover_photos as string[])
                    : [];
                const location = r.properties?.myr_city || r.properties?.city || "";
                return (
                  <Link
                    key={r.id}
                    to="/myr/room/$id"
                    params={{ id: r.id }}
                    className="rounded-xl overflow-hidden bg-card border border-border hover:shadow-elevated transition"
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
                      <div className="text-[10px] text-muted-foreground truncate">{location}</div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-10 text-center text-xs text-muted-foreground">
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
      </section>

      {/* Landlord CTA band — distinct from the tenant-facing content above */}
      <section className="border-t border-border bg-accent/40">
        <div className="max-w-6xl mx-auto px-4 py-10 flex flex-col md:flex-row items-center justify-between gap-4 text-center md:text-left">
          <div>
            <div className="font-semibold text-lg">Property ka malik hain?</div>
            <p className="text-sm text-muted-foreground mt-1">
              Apni property list karein, rooms/tenants/bills RentDesk se manage karein —
              subscription plans sirf landlords ke liye.
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

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ManageYourRoom · Powered by RentDesk
      </footer>
    </div>
  );
}
