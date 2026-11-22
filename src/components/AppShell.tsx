import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  DoorOpen,
  Users,
  Zap,
  Receipt,
  Settings,
  Moon,
  Sun,
  LogOut,
  UserCircle,
  Building2,
  ShieldCheck,
  Wrench,
  LogIn,
  Wallet,
  Inbox,
  BadgeCheck,
  Bell,
  CreditCard,
  ScrollText,
  Lock,
  Menu,
} from "lucide-react";
import { useEntitlements } from "@/lib/subscription/use-entitlements";
import { featureForPath } from "@/lib/subscription/keys";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/rentdesk", label: "Home", icon: LayoutDashboard },
  { to: "/properties", label: "Properties", icon: Building2 },
  { to: "/rooms", label: "Rooms", icon: DoorOpen },
  { to: "/tenants", label: "Tenants", icon: Users },
  { to: "/bookings", label: "Booking requests", icon: Inbox },
  { to: "/payment-verify", label: "Verify Payments", icon: BadgeCheck },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/verifications", label: "Verify", icon: ShieldCheck },
  { to: "/verify-identity", label: "Verify Identity", icon: BadgeCheck },
  { to: "/partner-import", label: "Partner Import", icon: Building2 },
  { to: "/maintenance", label: "Maintenance", icon: Wrench },
  { to: "/moves", label: "Moves", icon: LogIn },
  { to: "/deposits", label: "Deposits", icon: Wallet },
  { to: "/meters", label: "Meters", icon: Zap },
  { to: "/bills", label: "Bills", icon: Receipt },
  { to: "/rental-terms", label: "Rental terms", icon: ScrollText },
  { to: "/subscription", label: "Subscription", icon: CreditCard },
  { to: "/settings", label: "Rent & utility rates", icon: Settings },
  { to: "/feedback", label: "Product feedback", icon: Inbox },
  { to: "/contact", label: "Help & support", icon: Inbox },
] as const;

const GROUPS = [
  {
    label: "Daily work",
    paths: ["/rentdesk", "/rooms", "/tenants", "/bookings", "/notifications"],
  },
  { label: "Money", paths: ["/bills", "/payment-verify", "/deposits", "/meters"] },
  {
    label: "Property setup",
    paths: ["/properties", "/rental-terms", "/settings", "/maintenance", "/moves"],
  },
  {
    label: "Account & tools",
    paths: ["/verifications", "/verify-identity", "/partner-import", "/subscription", "/feedback", "/contact"],
  },
];
const MOBILE_NAV = [
  NAV[0],
  NAV[2],
  NAV[3],
  { to: "/bills", label: "Money", icon: Wallet },
  { to: "/bookings", label: "Requests", icon: Inbox },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const nav = useNavigate();
  const [dark, setDark] = useState(false);
  const [name, setName] = useState<string>("");
  const [menu, setMenu] = useState(false);
  const { ent } = useEntitlements();
  const locked = (to: string) => {
    const f = featureForPath(to);
    return !!ent && !!f && ent.features[f] !== true;
  };

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    const isDark = saved
      ? saved === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
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
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">
            R
          </div>
          <div>
            <div className="font-semibold leading-tight">RentDesk</div>
            <div className="text-xs text-muted-foreground">PG & Rent Manager</div>
          </div>
        </div>
        <nav aria-label="RentDesk" className="px-3 py-2 space-y-1">
          {GROUPS.map((group) => (
            <section key={group.label} className="pb-3">
              <h2 className="px-3 pb-2 pt-4 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h2>
              {NAV.filter((item) => group.paths.includes(item.to)).map((item) => {
                const active =
                  pathname === item.to || (item.to !== "/rentdesk" && pathname.startsWith(item.to));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                        : "text-sidebar-foreground hover:bg-sidebar-accent/60"
                    }`}
                  >
                    <Icon className="size-4" /> {item.label}
                    {locked(item.to) && (
                      <Lock
                        className="size-3 ml-auto text-muted-foreground"
                        aria-label="Not in your plan"
                      />
                    )}
                  </Link>
                );
              })}
            </section>
          ))}
        </nav>
        <div className="mt-auto p-3 space-y-1">
          <Link
            to="/profile"
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-sidebar-accent/60"
          >
            <UserCircle className="size-4" /> <span className="truncate">{name || "Profile"}</span>
          </Link>
          <button
            onClick={toggle}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-sidebar-foreground hover:bg-sidebar-accent/60"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            {dark ? "Light mode" : "Dark mode"}
          </button>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10"
          >
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-sidebar relative">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">
            R
          </div>
          <div className="font-semibold">RentDesk</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
            onClick={toggle}
            className="min-h-11 min-w-11 grid place-items-center p-2 rounded-lg hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <DropdownMenu open={menu} onOpenChange={setMenu}>
            <DropdownMenuTrigger asChild>
              <button
                aria-label="All tools and account"
                className="min-h-11 min-w-11 grid place-items-center p-2 rounded-lg hover:bg-sidebar-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Menu className="size-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 max-h-[80vh] overflow-y-auto">
              <DropdownMenuLabel className="break-words">{name || "Account"}</DropdownMenuLabel>
              {GROUPS.map((group) => (
                <div key={group.label}>
                  <DropdownMenuLabel className="mt-2 text-xs text-muted-foreground">
                    {group.label}
                  </DropdownMenuLabel>
                  {NAV.filter((item) => group.paths.includes(item.to)).map((item) => (
                    <DropdownMenuItem asChild key={item.to}>
                      <Link to={item.to} className="min-h-11 gap-3">
                        <item.icon className="size-4" />
                        {item.label}
                        {locked(item.to) && (
                          <Lock className="ml-auto size-3" aria-label="Not in your plan" />
                        )}
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </div>
              ))}
              <DropdownMenuItem asChild>
                <Link to="/profile" className="min-h-11">
                  Profile
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={logout} className="min-h-11 text-destructive">
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <nav
        aria-label="RentDesk mobile"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-sidebar border-t border-sidebar-border flex gap-1 px-1 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] justify-between"
      >
        {MOBILE_NAV.map((item) => {
          const active =
            pathname === item.to || (item.to !== "/rentdesk" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col justify-center items-center gap-0.5 px-2 py-1.5 text-[10px] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${active ? "text-primary bg-sidebar-accent font-semibold" : "text-muted-foreground"}`}
            >
              <Icon className="size-5" aria-hidden="true" />
              <span className="inline-flex items-center gap-1">
                {item.label}
                {locked(item.to) && <Lock className="size-3" aria-label="Not in your plan" />}
              </span>
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
