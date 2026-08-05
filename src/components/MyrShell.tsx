import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Home, Search, Heart, MessageSquare, CalendarCheck, UserCircle, LogOut, Building2, ShieldCheck, LayoutDashboard, Plus, Crown, Star, BarChart3, Settings } from "lucide-react";

type Variant = "tenant" | "landlord";

export function MyrShell({ children, variant = "tenant" }: { children: React.ReactNode; variant?: Variant }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "");
    });
  }, []);

  const logout = async () => { await supabase.auth.signOut(); nav({ to: "/" }); };

  const tenantNav = [
    { to: "/myr/browse", label: "Browse", icon: Search },
    { to: "/myr/saved", label: "Saved", icon: Heart },
    { to: "/myr/messages", label: "Inbox", icon: MessageSquare },
    { to: "/myr/bookings", label: "Bookings", icon: CalendarCheck },
  ] as const;

  const landlordNav = [
    { to: "/myr/landlord", label: "Dashboard", icon: LayoutDashboard },
    { to: "/myr/landlord/new", label: "New listing", icon: Plus },
    { to: "/myr/landlord/listings", label: "Listings", icon: Building2 },
    { to: "/myr/landlord/inquiries", label: "Inquiries", icon: MessageSquare },
    { to: "/myr/landlord/bookings", label: "Bookings", icon: CalendarCheck },
    { to: "/myr/landlord/verify", label: "Verify KYC", icon: ShieldCheck },
  ] as const;

  const landlordExtras = [
    { to: "/myr/profile", label: "Reviews", icon: Star },
    { to: "/myr/landlord", label: "Analytics", icon: BarChart3 },
    { to: "/myr/landlord", label: "Subscription", icon: Crown },
    { to: "/myr/profile", label: "Settings", icon: Settings },
  ] as const;

  const NAV = variant === "landlord" ? landlordNav : tenantNav;
  const isActive = (to: string) => pathname === to || pathname.startsWith(to + "/");

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
        <Link to="/" className="px-5 py-5 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">M</div>
          <div>
            <div className="font-semibold leading-tight">ManageYourRoom</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{variant}</div>
          </div>
        </Link>
        <nav className="px-3 py-2 space-y-1 overflow-y-auto">
          <Link to="/myr" className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent`}><Home className="size-4" /> Home</Link>
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link key={to + label} to={to as never} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive(to) ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent text-foreground"}`}>
              <Icon className="size-4" /> {label}
            </Link>
          ))}
          {variant === "landlord" && (
            <>
              <div className="pt-3 pb-1 px-3 text-[10px] uppercase tracking-wider text-muted-foreground">More</div>
              {landlordExtras.map(({ to, label, icon: Icon }) => (
                <Link key={to + label} to={to as never} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-accent text-foreground">
                  <Icon className="size-4" /> {label}
                </Link>
              ))}
            </>
          )}
        </nav>
        <div className="mt-auto p-3 space-y-1 text-sm">
          {variant === "tenant" ? (
            <Link to="/myr/onboard" search={{ role: "landlord" } as never} className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent text-primary">
              <Building2 className="size-4" /> Become a landlord
            </Link>
          ) : (
            <Link to="/myr/browse" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent">
              <Search className="size-4" /> Tenant view
            </Link>
          )}
          <Link to="/myr/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent"><UserCircle className="size-4" /> {name || "Profile"}</Link>
          <button onClick={logout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/60">
        <Link to="/" className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">M</div>
          <div className="font-semibold">MYR</div>
        </Link>
        <div className="text-xs text-muted-foreground capitalize">{variant}</div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex justify-around py-1 overflow-x-auto">
        {NAV.map(({ to, label, icon: Icon }) => (
          <Link key={to + label} to={to as never} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] rounded-md shrink-0 ${isActive(to) ? "text-primary" : "text-muted-foreground"}`}>
            <Icon className="size-5" /> {label}
          </Link>
        ))}
      </nav>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">{children}</div>
      </main>
    </div>
  );
}
