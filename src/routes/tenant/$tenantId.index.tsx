import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, Wallet, Receipt, Gauge, Wrench, Calendar } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/" });
  const fetchDash = useServerFn(getTenantDashboard);
  const { data, isLoading, error } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetchDash({ data: { tenant_id: tenantId } }) });

  return (
    <TenantShell>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : error ? <div className="text-sm text-destructive">{(error as Error).message}</div>
      : data && (
        <div className="space-y-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Hi, {data.tenant.name}</h1>
            <p className="text-sm text-muted-foreground">{data.room?.properties?.name} · Room {data.room?.room_number}</p>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat icon={Wallet} label="Outstanding" value={inr(data.outstanding)} tone={data.outstanding > 0 ? "warn" : "ok"} />
            <Stat icon={Receipt} label="Bills" value={data.bills.length} />
            <Stat icon={Wrench} label="Open tickets" value={data.tickets.filter((t: any) => t.status !== "resolved").length} />
            <Stat icon={Gauge} label="Last reading" value={data.meters[0]?.reading ?? "—"} />
          </div>

          {data.nextDue && (
            <Link to="/tenant/$tenantId/rent" params={{ tenantId }} className="block rounded-2xl border border-border bg-card p-4 hover:bg-accent/50">
              <div className="text-xs uppercase text-muted-foreground">Next due</div>
              <div className="mt-1 flex items-center justify-between">
                <div>
                  <div className="text-lg font-semibold">{inr((data.nextDue.total_amount ?? 0) - (data.nextDue.amount_paid ?? 0))}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1"><Calendar className="size-3" /> Due {new Date(data.nextDue.due_date).toLocaleDateString("en-IN")}</div>
                </div>
                <span className="text-xs px-2 py-1 rounded-md bg-primary/10 text-primary">View</span>
              </div>
            </Link>
          )}

          <div className="grid md:grid-cols-2 gap-3">
            <QuickLink to="/tenant/$tenantId/rent" tenantId={tenantId} icon={Receipt} title="Rent & Bills" sub="View invoices, pay history" />
            <QuickLink to="/tenant/$tenantId/maintenance" tenantId={tenantId} icon={Wrench} title="Maintenance" sub="Raise a ticket" />
            <QuickLink to="/tenant/$tenantId/meter" tenantId={tenantId} icon={Gauge} title="Meter readings" sub="Past consumption" />
            <QuickLink to="/tenant/$tenantId/deposit" tenantId={tenantId} icon={Wallet} title="Security deposit" sub="Held & refunds" />
          </div>
        </div>
      )}
    </TenantShell>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: React.ReactNode; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="size-4" /> {label}</div>
      <div className={`mt-2 text-xl font-semibold tracking-tight ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}

function QuickLink({ to, tenantId, icon: Icon, title, sub }: { to: string; tenantId: string; icon: React.ElementType; title: string; sub: string }) {
  return (
    <Link to={to as never} params={{ tenantId } as never} className="rounded-2xl bg-card border border-border p-4 hover:bg-accent/50 flex items-center gap-3">
      <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Icon className="size-5" /></div>
      <div>
        <div className="text-sm font-medium">{title}</div>
        <div className="text-xs text-muted-foreground">{sub}</div>
      </div>
    </Link>
  );
}
