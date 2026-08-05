import { Link, useLocation, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Home as HomeIcon, Receipt, Wallet, Gauge, Wrench, FileText, Bell, UserCircle, LogOut, History } from "lucide-react";

export function TenantShell({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const params = useParams({ strict: false }) as { tenantId?: string };
  const nav = useNavigate();
  const [name, setName] = useState("");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setName(data.user?.user_metadata?.full_name || data.user?.email?.split("@")[0] || "");
    });
  }, []);

  const tid = params.tenantId;
  const logout = async () => { await supabase.auth.signOut(); nav({ to: "/tenant" }); };

  const base = `/tenant/${tid}`;
  const NAV = tid ? [
    { to: `${base}`, label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: `${base}/room`, label: "Room", icon: HomeIcon },
    { to: `${base}/rent`, label: "Rent & Bills", icon: Receipt },
    { to: `${base}/deposit`, label: "Deposit", icon: Wallet },
    { to: `${base}/meter`, label: "Meter", icon: Gauge },
    { to: `${base}/maintenance`, label: "Maintenance", icon: Wrench },
    { to: `${base}/documents`, label: "Documents", icon: FileText },
    { to: `${base}/notifications`, label: "Notifications", icon: Bell },
    { to: `${base}/history`, label: "History", icon: History },
    { to: `${base}/profile`, label: "Profile", icon: UserCircle },
  ] : [];

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-background text-foreground">
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border bg-card/40">
        <Link to="/tenant" className="px-5 py-5 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">T</div>
          <div>
            <div className="font-semibold leading-tight">Tenant Portal</div>
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">My home</div>
          </div>
        </Link>
        <nav className="px-3 py-2 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <Link key={to} to={to as never} className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive(to, exact) ? "bg-primary text-primary-foreground font-medium" : "hover:bg-accent"}`}>
              <Icon className="size-4" /> {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-3 text-sm">
          <button onClick={logout} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-destructive hover:bg-destructive/10">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      </aside>

      <header className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card/60">
        <Link to="/tenant" className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center font-bold text-sm">T</div>
          <div className="font-semibold">Tenant</div>
        </Link>
        <div className="text-xs text-muted-foreground truncate max-w-[160px]">{name}</div>
      </header>

      {tid && (
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-card border-t border-border flex justify-around py-1 overflow-x-auto">
          {NAV.slice(0, 6).map(({ to, label, icon: Icon, exact }) => (
            <Link key={to} to={to as never} className={`flex flex-col items-center gap-0.5 px-3 py-1.5 text-[10px] shrink-0 ${isActive(to, exact) ? "text-primary" : "text-muted-foreground"}`}>
              <Icon className="size-5" /> {label}
            </Link>
          ))}
        </nav>
      )}

      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        <div className="max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10">{children}</div>
      </main>
    </div>
  );
}
