import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAdminDashboard } from "@/lib/admin.functions";
import { Building2, DoorOpen, Users, Receipt, Wallet, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin/")({ component: AdminDashboard });

const fmtINR = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Stat({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" /> {label}</div>
      <div className="mt-2 text-2xl font-semibold tracking-tight">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function AdminDashboard() {
  const fetchDash = useServerFn(getAdminDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["admin-dashboard"], queryFn: () => fetchDash() });
  if (isLoading || !data) return <div className="text-sm text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">System-wide analytics across all landlords and tenants.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat icon={Users} label="Landlords" value={data.counts.users} />
        <Stat icon={Building2} label="Properties" value={data.counts.properties} />
        <Stat icon={DoorOpen} label="Rooms" value={data.counts.rooms} />
        <Stat icon={Users} label="Tenants" value={data.counts.tenants} />
        <Stat icon={Receipt} label="Bills paid" value={data.counts.billsPaid} sub={`${data.counts.billsPending} pending`} />
        <Stat icon={TrendingUp} label="Collected" value={fmtINR(data.money.totalCollected)} sub={`of ${fmtINR(data.money.totalBilled)} billed`} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Stat icon={Wallet} label="Outstanding" value={fmtINR(data.money.outstanding)} />
        <Stat icon={Receipt} label="Payments recorded" value={data.money.paymentsCount} />
      </div>

      <section className="rounded-2xl bg-card border border-border p-4">
        <h2 className="text-sm font-semibold mb-3">Recent audit events</h2>
        {data.recentAudits.length === 0 ? (
          <p className="text-xs text-muted-foreground">No admin actions yet.</p>
        ) : (
          <ul className="text-xs space-y-2">
            {data.recentAudits.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{a.action}</div>
                  <div className="text-muted-foreground">
                    {a.target_type ?? "—"} {a.target_id ? `· ${a.target_id.slice(0, 8)}` : ""}
                  </div>
                </div>
                <div className="text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString("en-IN")}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-border p-4">
        <h2 className="text-sm font-semibold mb-3">Recent admin sign-ins</h2>
        {data.recentLogins.length === 0 ? (
          <p className="text-xs text-muted-foreground">No sign-in attempts logged.</p>
        ) : (
          <ul className="text-xs space-y-2">
            {data.recentLogins.map((l) => (
              <li key={l.id} className="flex items-start justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0">
                <div>
                  <div className="font-medium">{l.email ?? "—"} {l.success ? "✓" : "✗"}</div>
                  <div className="text-muted-foreground truncate max-w-[260px]">{l.user_agent ?? ""}</div>
                </div>
                <div className="text-muted-foreground whitespace-nowrap">
                  {l.ip_address ?? ""} · {new Date(l.created_at).toLocaleString("en-IN")}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
