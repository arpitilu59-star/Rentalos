import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, DoorOpen, Users, Zap, Receipt, Settings, Moon, Sun, LogOut, UserCircle, Building2, ShieldCheck, Wrench, LogIn, Wallet, Inbox, BadgeCheck, Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const NAV = [
  { to: "/rentdesk", label: "Dashboard", icon: LayoutDashboard },
  { to: "/properties", label: "Properties", icon: Building2 },
  { to: "/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/bookings", label: "MYR Bookings", icon: Inbox },
  { to: "/payment-verify", label: "Verify Payments", icon: BadgeCheck },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/verifications", label: "Verify", icon: ShieldCheck },
  { to: "/maintenance", label: "Tickets", icon: Wrench },
  { to: "/moves", label: "Moves", icon: LogIn },
  { to: "/deposits", label: "Deposits", icon: Wallet },
  { to: "/meters", label: "Meters", icon: Zap },
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/settings", label: "Pricing", icon: Settings },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [dark, setDark] = useState(false);
  const [name, setName] = useState<string>("");
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved ? saved === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
    supabase.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "");
    });
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
  };

  const logout = async () => {
    await supabase.auth.signOut();
    nav({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground">
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="px-6 py-5 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">R</div>
          <div>
            <div className="font-semibold leading-tight">RentDesk</div>
            <div className="text-xs text-muted-foreground">PG & Rent Manager</div>
          </div>
        </div>
        <nav className="px-3 py-2 space-y-1">
          {NAV.map((item) => {
            const active = pathname === item.to || (item.to !== "/rentdesk" && pathname.startsWith(item.to));
            const Icon = item.icon;
            return (
              <Link key={item.to} to={item.to}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                }`}>
                <Icon className="size-4" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto p-3 space-y-1">
          <Link to="/profile" className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60">
            <UserCircle className="size-4" /> <span className="truncate">{name || "Profile"}</span>
          </Link>
          <button onClick={toggle} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60">
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <button onClick={logout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar relative">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">R</div>
          <div className="font-semibold">RentDesk</div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={toggle} className="p-2 rounded-lg hover:bg-sidebar-accent">{dark ? <Sun className="size-4" /> : <Moon className="size-4" />}</button>
          <button onClick={() => setMenu((m) => !m)} className="p-2 rounded-lg hover:bg-sidebar-accent"><UserCircle className="size-5" /></button>
        </div>
        {menu && (
          <div className="absolute right-3 top-14 z-50 w-48 rounded-xl bg-card border border-border shadow-elevated py-1 text-sm">
            <div className="px-3 py-2 text-xs text-muted-foreground truncate">{name}</div>
            <Link to="/profile" onClick={() => setMenu(false)} className="block px-3 py-2 hover:bg-accent">Profile</Link>
            <button onClick={logout} className="w-full text-left px-3 py-2 text-destructive hover:bg-destructive/10">Sign out</button>
          </div>
        )}
      </header>

      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex justify-around py-1 overflow-x-auto">
        {NAV.map((item) => {
          const active = pathname === item.to || (item.to !== "/rentdesk" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-0.5 px-2 py-1.5 text-[10px] rounded-md shrink-0 ${active ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="size-5" /> {item.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="max-w-6xl mx-auto px-4 md:px-8 py-6 md:py-10">{children}</div>
      </main>
    </div>
  );
}
