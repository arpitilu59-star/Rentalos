import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Search, MapPin, ShieldCheck, Sparkles, Building2, Home, Users, LayoutDashboard, UserCircle, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/myr/")({ component: MyrHome });

function MyrHome() {
  const nav = useNavigate();
  const [city, setCity] = useState("");
  const [type, setType] = useState("");

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ to: "/myr/browse", search: { city: city || undefined, type: type || undefined } as never });
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/myr" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">M</div>
            <div className="font-semibold tracking-tight">ManageYourRoom</div>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link to="/myr/browse" className="px-3 py-1.5 rounded-md hover:bg-accent">Browse</Link>
            <Link to="/login" className="px-3 py-1.5 rounded-md hover:bg-accent">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative">
        <div className="max-w-6xl mx-auto px-4 pt-10 pb-6 md:pt-16 md:pb-10 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-accent text-accent-foreground"><Sparkles className="size-3" /> Verified PGs, rooms & flats</div>
          <h1 className="mt-4 text-3xl md:text-5xl font-semibold tracking-tight">
            Apna <span className="text-primary">naya ghar</span> dhundhein
          </h1>
          <p className="mt-3 text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            PG, room, flat ya shared accommodation — verified owners ke saath, bina broker, seedha book karein.
          </p>

          {/* Search */}
          <form onSubmit={submitSearch} className="mt-6 grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2 max-w-2xl mx-auto bg-card border border-border rounded-2xl p-2 shadow-card">
            <div className="relative">
              <MapPin className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City (Delhi, Bangalore…)" className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
            </div>
            <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2.5 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40">
              <option value="">All types</option>
              <option value="pg">PG</option>
              <option value="room">Room</option>
              <option value="flat">Flat</option>
              <option value="hostel">Hostel</option>
              <option value="shared">Shared</option>
            </select>
            <button className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">
              <Search className="size-4" /> Search
            </button>
          </form>

          <div className="mt-3 text-xs text-muted-foreground flex items-center justify-center gap-4 flex-wrap">
            <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3.5" /> Verified owners</span>
            <span className="inline-flex items-center gap-1"><Users className="size-3.5" /> 10-min booking lock</span>
            <span className="inline-flex items-center gap-1"><Home className="size-3.5" /> No brokerage</span>
          </div>
        </div>
      </section>

      {/* 3 role choices — main CTA */}
      <section className="max-w-6xl mx-auto px-4 py-6 md:py-10">
        <div className="text-center mb-6">
          <h2 className="text-xl md:text-2xl font-semibold tracking-tight">Aap kya karna chahte hain?</h2>
          <p className="text-sm text-muted-foreground mt-1">Apna role chunein — confusion bilkul nahi</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          {/* Browse / Tenant */}
          <Link to="/myr/browse" className="group rounded-2xl bg-card border border-border p-6 hover:border-primary hover:shadow-card transition text-left">
            <div className="size-11 rounded-xl bg-primary/10 text-primary grid place-items-center mb-3"><Search className="size-5" /></div>
            <div className="font-semibold">Browse properties</div>
            <p className="text-xs text-muted-foreground mt-1">Bina sign-in PG, room, flat dekhein. Map, photos, rent — sab kuch.</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">Explore <ArrowRight className="size-3" /></div>
          </Link>

          {/* Tenant sign-in */}
          <Link to="/login" search={{ next: "/myr/browse" } as never} className="group rounded-2xl bg-card border border-border p-6 hover:border-primary hover:shadow-card transition text-left">
            <div className="size-11 rounded-xl bg-accent text-accent-foreground grid place-items-center mb-3"><UserCircle className="size-5" /></div>
            <div className="font-semibold">Sign in as Tenant</div>
            <p className="text-xs text-muted-foreground mt-1">Save listings, message landlords, reserve rooms aur apni bookings track karein.</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-primary group-hover:gap-2 transition-all">Continue <ArrowRight className="size-3" /></div>
          </Link>

          {/* Landlord sign-in */}
          <Link to="/myr/onboard" search={{ role: "landlord" } as never} className="group rounded-2xl bg-foreground text-background border border-foreground p-6 hover:opacity-95 transition text-left">
            <div className="size-11 rounded-xl bg-background/15 text-background grid place-items-center mb-3"><Building2 className="size-5" /></div>
            <div className="font-semibold">Sign in as Landlord</div>
            <p className="text-xs text-background/70 mt-1">Property list karein, photos upload karein, verified tenants se direct inquiries paayein.</p>
            <div className="mt-4 inline-flex items-center gap-1 text-xs font-medium group-hover:gap-2 transition-all">List your property <ArrowRight className="size-3" /></div>
          </Link>
        </div>
      </section>

      {/* Browse by type */}
      <section className="max-w-6xl mx-auto px-4 pb-10">
        <h2 className="text-lg font-semibold mb-3">Browse by type</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(["pg", "room", "flat", "hostel", "shared"] as const).map((t) => (
            <Link key={t} to="/myr/browse" search={{ type: t } as never} className="rounded-2xl bg-card border border-border p-5 text-center hover:border-primary hover:shadow-card transition">
              <div className="mx-auto size-10 rounded-xl bg-accent text-accent-foreground grid place-items-center mb-2"><Building2 className="size-5" /></div>
              <div className="text-sm font-medium capitalize">{t}</div>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-6xl mx-auto px-4 pb-12">
        <h2 className="text-lg font-semibold mb-4 text-center">How it works</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { n: 1, t: "Search & shortlist", d: "City aur type select karein. Verified listings dekhein." },
            { n: 2, t: "Connect with owner", d: "Inquiry bhejein ya 10-min ke liye room reserve karein." },
            { n: 3, t: "Move in", d: "Documents share karein, deposit pay karein, ghar shift karein." },
          ].map((s) => (
            <div key={s.n} className="rounded-2xl bg-card border border-border p-5">
              <div className="size-7 rounded-full bg-primary text-primary-foreground grid place-items-center text-xs font-bold">{s.n}</div>
              <div className="mt-3 font-semibold text-sm">{s.t}</div>
              <p className="text-xs text-muted-foreground mt-1">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Landlord CTA strip */}
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="rounded-3xl bg-gradient-to-br from-primary/15 via-accent to-background border border-border p-8 md:p-12 text-center">
          <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">Aapke paas property hai?</h3>
          <p className="mt-2 text-sm md:text-base text-muted-foreground max-w-lg mx-auto">List karein ManageYourRoom par — verified tenants se direct inquiries paayein, free plan ke saath shuru karein.</p>
          <Link to="/myr/onboard" search={{ role: "landlord" } as never} className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-foreground text-background text-sm font-medium hover:opacity-90">
            <LayoutDashboard className="size-4" /> List your property
          </Link>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} ManageYourRoom · MYR
      </footer>
    </div>
  );
}
