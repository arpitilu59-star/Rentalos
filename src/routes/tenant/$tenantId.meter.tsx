import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, Gauge } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/meter")({ component: Page });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/meter" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><Gauge className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Meter Readings</h1></div>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !data?.meters?.length ? <div className="py-20 text-center text-sm text-muted-foreground">No readings yet.</div>
      : (
        <div className="space-y-2 max-w-xl">
          {data.meters.map((m: any, i: number) => {
            const prev = data.meters[i + 1]?.reading;
            const diff = prev != null ? m.reading - prev : null;
            return (
              <div key={m.id} className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">{new Date(m.reading_date).toLocaleDateString("en-IN")}</div>
                  <div className="text-xs text-muted-foreground">{m.ai_detected ? "AI detected" : "Manual"}</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold">{m.reading}</div>
                  {diff != null && <div className="text-xs text-muted-foreground">+{diff} units</div>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </TenantShell>
  );
}
