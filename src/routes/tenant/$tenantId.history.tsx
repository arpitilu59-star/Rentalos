import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, History } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/history")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/history" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });

  const items = (data?.bills ?? []).filter((b: any) => b.amount_paid > 0);

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><History className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Payment History</h1></div>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !items.length ? <div className="py-20 text-center text-sm text-muted-foreground">No payments yet.</div>
      : (
        <div className="space-y-2 max-w-xl">
          {items.map((b: any) => (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
              <div>
                <div className="text-sm font-medium">{new Date(b.rent_period_start).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</div>
                <div className="text-xs text-muted-foreground">{b.paid_at ? `Paid ${new Date(b.paid_at).toLocaleDateString("en-IN")}` : "Partial"}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold">{inr(b.amount_paid)}</div>
                <div className="text-[11px] text-muted-foreground">of {inr(b.total_amount)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </TenantShell>
  );
}
