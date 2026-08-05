import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listFraudFlags, detectDuplicates, resolveFraudFlag } from "@/lib/admin-monitoring.functions";
import { AlertTriangle, Loader2, ShieldAlert, Check, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/fraud")({ component: FraudPage });

function FraudPage() {
  const qc = useQueryClient();
  const fetchFlags = useServerFn(listFraudFlags);
  const detect = useServerFn(detectDuplicates);
  const resolve = useServerFn(resolveFraudFlag);

  const q = useQuery({ queryKey: ["fraud-flags"], queryFn: () => fetchFlags() });

  const runScan = async () => {
    await detect();
    qc.invalidateQueries({ queryKey: ["fraud-flags"] });
  };

  const toggle = async (id: string, resolved: boolean) => {
    await resolve({ data: { id, resolved } });
    qc.invalidateQueries({ queryKey: ["fraud-flags"] });
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldAlert className="size-5 text-destructive" /> Fraud detection</h1>
          <p className="text-xs text-muted-foreground mt-1">Suspicious accounts and duplicate identifier detection.</p>
        </div>
        <button onClick={runScan} className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent">
          <RefreshCw className="size-3.5" /> Scan duplicates
        </button>
      </div>

      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> :
        (q.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No fraud flags detected.</p>
        ) : (
          <div className="space-y-2">
            {q.data!.items.map((f: any) => (
              <div key={f.id} className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle className={`size-4 ${f.severity === "critical" || f.severity === "high" ? "text-destructive" : "text-amber-500"}`} />
                    {f.kind.replace(/_/g, " ")}
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${f.severity === "critical" || f.severity === "high" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>{f.severity}</span>
                    {f.resolved && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">resolved</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    User: {f.profile?.full_name || f.profile?.email || f.user_id}
                  </div>
                  <pre className="text-[11px] text-muted-foreground mt-1 overflow-x-auto">{JSON.stringify(f.details, null, 2)}</pre>
                </div>
                <button onClick={() => toggle(f.id, !f.resolved)} className="text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-accent shrink-0">
                  <Check className="size-3.5" /> {f.resolved ? "Reopen" : "Resolve"}
                </button>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
