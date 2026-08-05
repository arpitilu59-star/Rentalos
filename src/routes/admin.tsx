import { createFileRoute, Outlet, useNavigate, Link, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyAdmin } from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, ShieldCheck, LayoutDashboard, Users, ClipboardList, KeyRound, LogOut, Lock, Activity, ShieldAlert, BadgeCheck } from "lucide-react";

const IDLE_TIMEOUT_MS = 15 * 60 * 1000;


export const Route = createFileRoute("/admin")({ component: AdminLayout });

function AdminLayout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const fetchMe = useServerFn(getMyAdmin);
  const [bootChecked, setBootChecked] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav({ to: "/system-admin-control" });
      else setBootChecked(true);
    });
  }, [nav]);

  const q = useQuery({
    queryKey: ["my-admin"],
    queryFn: () => fetchMe(),
    enabled: bootChecked,
    retry: false,
  });

  useEffect(() => {
    if (q.isFetched && !q.data) {
      nav({ to: "/" });
    }
  }, [q.isFetched, q.data, nav]);

  // Idle timeout: auto sign-out after IDLE_TIMEOUT_MS of no activity
  useEffect(() => {
    if (!q.data) return;
    let timer: ReturnType<typeof setTimeout>;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        await supabase.auth.signOut();
        nav({ to: "/system-admin-control" });
      }, IDLE_TIMEOUT_MS);
    };
    const evts = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    evts.forEach((e) => window.addEventListener(e, reset, { passive: true }));
    reset();
    return () => {
      clearTimeout(timer);
      evts.forEach((e) => window.removeEventListener(e, reset));
    };
  }, [q.data, nav]);


  if (!bootChecked || q.isLoading || !q.data) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const me = q.data;
  const isRoot = me.role === "root_owner";

  const items = [
    { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
    { to: "/admin/users", label: "Users", icon: Users },
    { to: "/admin/fraud", label: "Fraud", icon: ShieldAlert },
    { to: "/admin/myr-verifications", label: "MYR Verify", icon: BadgeCheck },
    { to: "/admin/activity", label: "Activity", icon: Activity },
    { to: "/admin/diagnostics", label: "Diagnostics", icon: Activity },
    { to: "/admin/audits", label: "Audit logs", icon: ClipboardList },
    { to: "/admin/security", label: "Security", icon: Lock },
    ...(isRoot ? [{ to: "/admin/admins", label: "Admins", icon: KeyRound }] : []),
  ] as const;


  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === "/admin" || pathname === "/admin/" : pathname.startsWith(to) && to !== "/admin";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" />
            <div>
              <div className="text-sm font-semibold tracking-tight">System Admin Control</div>
              <div className="text-[11px] text-muted-foreground uppercase">{me.role.replace(/_/g, " ")}</div>
            </div>
          </div>
          <button
            onClick={async () => { await supabase.auth.signOut(); nav({ to: "/system-admin-control" }); }}
            className="text-xs inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 hover:bg-accent"
          >
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
        <nav className="max-w-6xl mx-auto px-2 pb-2 flex flex-wrap gap-1">
          {items.map((it) => (
            <Link
              key={it.to} to={it.to as never}
              className={`text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-colors ${
                isActive(it.to, "exact" in it ? it.exact : false)
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-accent text-muted-foreground"
              }`}
            >
              <it.icon className="size-3.5" /> {it.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
