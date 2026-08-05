import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminDiagnostics } from "@/lib/admin.functions";
import { Activity, AlertTriangle, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/diagnostics")({ component: Diagnostics });

function Diagnostics() {
  const fn = useServerFn(adminDiagnostics);
  const q = useQuery({ queryKey: ["admin-diagnostics"], queryFn: () => fn(), retry: false });

  if (q.isLoading) return <p className="text-xs text-muted-foreground">Running diagnostics…</p>;
  if (q.error) return <p className="text-xs text-destructive">{(q.error as Error).message}</p>;
  const d = q.data!;

  const cards = [
    { label: "Auth users", v: d.counts.authUsers },
    { label: "Profiles", v: d.counts.profiles },
    { label: "Tenants", v: d.counts.tenants },
    { label: "Properties", v: d.counts.properties },
    { label: "Rooms", v: d.counts.rooms },
    { label: "Bills", v: d.counts.bills },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Activity className="size-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">Admin Diagnostics</h1>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-2xl bg-card border border-border p-4">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
            <div className="text-2xl font-semibold mt-1">{c.v}</div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
        <div className="flex items-center gap-2">
          {d.missingProfiles.length === 0 ? (
            <CheckCircle2 className="size-4 text-emerald-500" />
          ) : (
            <AlertTriangle className="size-4 text-amber-500" />
          )}
          <h2 className="text-sm font-semibold">Missing profile records ({d.missingProfiles.length})</h2>
        </div>
        {d.missingProfiles.length === 0 ? (
          <p className="text-xs text-muted-foreground">Every auth user has a profile row.</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-muted-foreground"><tr><th className="text-left py-1">Email</th><th className="text-left">User ID</th><th className="text-left">Signed up</th></tr></thead>
            <tbody>
              {d.missingProfiles.map((u) => (
                <tr key={u.id} className="border-t border-border">
                  <td className="py-1.5">{u.email ?? "—"}</td>
                  <td className="font-mono text-[10px]">{u.id}</td>
                  <td>{new Date(u.created_at).toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-border p-4 space-y-2">
        <h2 className="text-sm font-semibold">Recent signups (auth)</h2>
        <table className="w-full text-xs">
          <thead className="text-muted-foreground"><tr><th className="text-left py-1">Email</th><th className="text-left">Created</th><th className="text-left">Last sign-in</th></tr></thead>
          <tbody>
            {d.recentAuthUsers.map((u) => (
              <tr key={u.id} className="border-t border-border">
                <td className="py-1.5">{u.email ?? "—"}</td>
                <td>{new Date(u.created_at).toLocaleString("en-IN")}</td>
                <td>{u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString("en-IN") : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
