import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Search, MapPin, ShieldCheck, Sparkles, Building2, Home, LayoutDashboard, ArrowRight, User, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/")({ component: MyrLanding });

function MyrLanding() {
  const nav = useNavigate();
  const [city, setCity] = useState("");
  const [showLandlordWarn, setShowLandlordWarn] = useState(false);
  const [routed, setRouted] = useState(false);

  // Sticky routing: if already signed in with a role, jump to their app
  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: prof } = await supabase.from("profiles").select("primary_role").eq("id", session.user.id).maybeSingle();
      if (prof?.primary_role === "landlord") { setRouted(true); nav({ to: "/rentdesk" }); }
      else if (prof?.primary_role === "tenant") { setRouted(true); nav({ to: "/tenant" }); }
    })();
  }, [nav]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ to: "/myr/browse", search: { city: city || undefined } as never });
  };

  if (routed) return <div className="min-h-screen bg-background" />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">M</div>
            <div className="font-semibold tracking-tight">ManageYourRoom</div>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/myr/browse" className="px-3 py-1.5 rounded-md hover:bg-accent">Browse rooms</Link>
            <button onClick={() => setShowLandlordWarn(true)} className="px-3 py-1.5 rounded-md hover:bg-accent hidden sm:inline">List your property</button>
          </nav>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 pt-12 pb-8 md:pt-20 md:pb-14 text-center">
        <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground">
          <Sparkles className="size-3" /> Verified PGs, rooms & flats — no broker
        </div>
        <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">
          Apna <span className="text-primary">naya ghar</span> dhundhein
        </h1>
        <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
          Bina login ke rooms browse karein. Book karte samay hi tenant login karein — direct landlord se connect.
        </p>

        <form onSubmit={submitSearch} className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 max-w-xl mx-auto bg-card border border-border rounded-2xl p-2 shadow-card">
          <div className="relative">
            <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City (Delhi, Bangalore…)" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
          </div>
          <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
            <Search className="size-4" /> Browse rooms
          </button>
        </form>
      </section>

      {/* Three-way router */}
      <section className="max-w-6xl mx-auto px-4 pb-16 grid gap-4 md:grid-cols-3">
        <Link to="/myr/browse" className="rounded-2xl bg-card border border-border p-6 hover:shadow-elevated transition">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center mb-3"><Home className="size-5" /></div>
          <div className="font-semibold">Browse rooms</div>
          <p className="text-xs text-muted-foreground mt-1">Bina login ke saare available rooms dekhein. Filter by city, rent, type.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-medium">Explore <ArrowRight className="size-3" /></div>
        </Link>

        <Link to="/tenant/login" className="rounded-2xl bg-card border border-border p-6 hover:shadow-elevated transition">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center mb-3"><User className="size-5" /></div>
          <div className="font-semibold">Sign in as Tenant</div>
          <p className="text-xs text-muted-foreground mt-1">Your bookings, rent bills, meter readings, deposit & UPI payments.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-medium">Tenant login <ArrowRight className="size-3" /></div>
        </Link>

        <button onClick={() => setShowLandlordWarn(true)} className="text-left rounded-2xl bg-card border border-border p-6 hover:shadow-elevated transition">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center mb-3"><LayoutDashboard className="size-5" /></div>
          <div className="font-semibold">Sign in as Landlord</div>
          <p className="text-xs text-muted-foreground mt-1">List your property. Manage rooms, tenants & bills in RentDesk.</p>
          <div className="mt-4 inline-flex items-center gap-1 text-xs text-primary font-medium">Landlord login <ArrowRight className="size-3" /></div>
        </button>
      </section>

      <section className="max-w-6xl mx-auto px-4 pb-16 text-center text-xs text-muted-foreground">
        <div className="flex items-center justify-center gap-6">
          <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> Verified owners</span>
          <span className="inline-flex items-center gap-1"><Building2 className="size-3.5" /> Direct UPI payment</span>
          <span className="inline-flex items-center gap-1"><Home className="size-3.5" /> No brokerage</span>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ManageYourRoom · Powered by RentDesk
      </footer>

      {showLandlordWarn && (
        <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated p-6">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-destructive/15 text-destructive grid place-items-center shrink-0"><AlertTriangle className="size-5" /></div>
              <div>
                <div className="font-semibold">Landlord access only</div>
                <p className="text-sm text-muted-foreground mt-1">
                  This portal is only for verified property owners. Fake property information or misuse may lead to
                  <span className="text-foreground font-medium"> account suspension and applicable legal action</span> under Indian IT & fraud laws.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowLandlordWarn(false)} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
              <button onClick={() => { setShowLandlordWarn(false); nav({ to: "/landlord/login" }); }} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium">I agree — continue</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
