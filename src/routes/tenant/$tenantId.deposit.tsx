import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, Wallet } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/deposit")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/deposit" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });
  const d = data?.deposit;

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><Wallet className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Security Deposit</h1></div>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !d ? <div className="py-20 text-center text-sm text-muted-foreground">No deposit recorded.</div>
      : (
        <div className="rounded-2xl bg-card border border-border p-5 max-w-xl">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Big label="Held" value={inr(d.amount_held)} />
            <Big label="Deducted" value={inr(d.amount_deducted)} />
            <Big label="Refunded" value={inr(d.amount_refunded)} />
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Status</span>
            <span className="uppercase px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{d.status}</span>
          </div>
          {d.deduction_reason && <div className="mt-3 text-xs"><span className="text-muted-foreground">Reason: </span>{d.deduction_reason}</div>}
          {d.refunded_at && <div className="mt-1 text-xs text-muted-foreground">Refunded on {new Date(d.refunded_at).toLocaleDateString("en-IN")}</div>}
        </div>
      )}
    </TenantShell>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="text-lg font-semibold">{value}</div></div>;
}
