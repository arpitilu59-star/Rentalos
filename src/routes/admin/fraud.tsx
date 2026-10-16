import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listFraudFlags,
  detectDuplicates,
  detectDuplicatePhotos,
  resolveFraudFlag,
} from "@/lib/admin-monitoring.functions";
import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Loader2, ShieldAlert, Check, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/admin/fraud")({ component: FraudPage });

function FraudPage() {
  const qc = useQueryClient();
  const fetchFlags = useServerFn(listFraudFlags);
  const detect = useServerFn(detectDuplicates);
  const detectPhotos = useServerFn(detectDuplicatePhotos);
  const resolve = useServerFn(resolveFraudFlag);

  const q = useQuery({ queryKey: ["fraud-flags"], queryFn: () => fetchFlags() });

  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const runScan = async () => {
    setScanning(true);
    try {
      await Promise.all([detect(), detectPhotos()]);
      await qc.invalidateQueries({ queryKey: ["fraud-flags"] });
      toast.success("Scan complete.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed. Please try again.");
    } finally {
      setScanning(false);
    }
  };

  const toggle = async (id: string, resolved: boolean) => {
    setBusyId(id);
    try {
      await resolve({ data: { id, resolved } });
      await qc.invalidateQueries({ queryKey: ["fraud-flags"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't update the flag.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShieldAlert className="size-5 text-destructive" /> Fraud detection
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            Suspicious accounts and duplicate identifier detection.
          </p>
        </div>
        <button
          onClick={runScan}
          disabled={scanning}
          className="disabled:opacity-50 inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent"
        >
          <RefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} /> {scanning ? "Scanning…" : "Scan duplicates"}
        </button>
      </div>

      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (q.data?.items ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No fraud flags detected.</p>
      ) : (
        <div className="space-y-2">
          {q.data!.items.map(
            (f: {
              id: string;
              kind: string;
              severity: string;
              details: unknown;
              resolved: boolean;
              created_at: string;
              user_id?: string;
              profile?: { full_name?: string | null; email?: string | null } | null;
            }) => (
              <div
                key={f.id}
                className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <AlertTriangle
                      className={`size-4 ${f.severity === "critical" || f.severity === "high" ? "text-destructive" : "text-amber-500"}`}
                    />
                    {f.kind.replace(/_/g, " ")}
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${f.severity === "critical" || f.severity === "high" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}
                    >
                      {f.severity}
                    </span>
                    {f.resolved && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">
                        resolved
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    User: {f.profile?.full_name || f.profile?.email || f.user_id}
                  </div>
                  <pre className="text-[11px] text-muted-foreground mt-1 overflow-x-auto">
                    {JSON.stringify(f.details, null, 2)}
                  </pre>
                </div>
                <button
                  onClick={() => toggle(f.id, !f.resolved)}
                  disabled={busyId === f.id}
                  className="disabled:opacity-50 text-xs inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-border hover:bg-accent shrink-0"
                >
                  <Check className="size-3.5" /> {f.resolved ? "Reopen" : "Resolve"}
                </button>
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
