import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getAdminOpsOverview, listAutomationRuns } from "@/lib/admin-ops.functions";
import { Loader2, AlertTriangle, Activity, CheckCircle2, XCircle, SkipForward } from "lucide-react";

export const Route = createFileRoute("/admin/ops")({ component: OpsPage });

type Run = {
  id: string;
  job: string;
  entity_type: string | null;
  entity_id: string | null;
  period_key: string;
  status: string;
  error: string | null;
  created_at: string;
};

function OpsPage() {
  const overview = useServerFn(getAdminOpsOverview);
  const runs = useServerFn(listAutomationRuns);

  const q = useQuery({ queryKey: ["admin-ops"], queryFn: () => overview() });
  const r = useQuery({ queryKey: ["automation-runs"], queryFn: () => runs() });

  const tiles = [
    { label: "Overdue bills", value: q.data?.overdueBills, to: "/admin" as const, urgent: true },
    { label: "Due today", value: q.data?.dueToday, to: "/admin" as const },
    { label: "Unverified payments", value: q.data?.unverifiedPayments, to: "/admin" as const },
    { label: "Pending KYC", value: q.data?.pendingKyc, to: "/admin/myr-verifications" as const },
    {
      label: "Videos awaiting review",
      value: q.data?.pendingVideos,
      to: "/admin/live-feed-review" as const,
    },
    { label: "Open maintenance", value: q.data?.openTickets, to: "/admin" as const },
    {
      label: "Unresolved fraud flags",
      value: q.data?.openFraud,
      to: "/admin/fraud" as const,
      urgent: true,
    },
    {
      label: "Automation failures (7d)",
      value: q.data?.failedAutomations,
      to: "/admin/ops" as const,
      urgent: true,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Activity className="size-5 text-primary" /> Operations
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Live counts from real data — what actually needs attention right now.
        </p>
      </div>

      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {tiles.map((t) => (
            <Link
              key={t.label}
              to={t.to}
              className="rounded-xl border border-border bg-card p-4 hover:bg-accent/40 transition"
            >
              <div className="text-xs text-muted-foreground">{t.label}</div>
              <div
                className={`mt-1.5 text-2xl font-semibold ${t.urgent && (t.value ?? 0) > 0 ? "text-destructive" : ""}`}
              >
                {t.value ?? "—"}
              </div>
            </Link>
          ))}
        </div>
      )}

      <div>
        <h2 className="text-sm font-semibold mb-2">Recent automation runs</h2>
        {r.isLoading ? (
          <Loader2 className="size-5 animate-spin" />
        ) : (r.data?.runs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No automation runs recorded yet. (Runs appear here once the scheduled rent job
            executes.)
          </p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted">
                <tr>
                  <th className="text-left p-2">Job</th>
                  <th className="text-left p-2">Period</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {(r.data?.runs ?? []).map((run: Run) => (
                  <tr key={run.id} className="border-t border-border">
                    <td className="p-2 font-medium">{run.job}</td>
                    <td className="p-2 text-muted-foreground">{run.period_key}</td>
                    <td className="p-2">
                      <span className="inline-flex items-center gap-1">
                        {run.status === "completed" && (
                          <CheckCircle2 className="size-3 text-emerald-600" />
                        )}
                        {run.status === "failed" && <XCircle className="size-3 text-destructive" />}
                        {run.status === "skipped" && (
                          <SkipForward className="size-3 text-muted-foreground" />
                        )}
                        {run.status === "started" && <Loader2 className="size-3" />}
                        {run.status}
                      </span>
                      {run.error && (
                        <div className="text-[10px] text-destructive mt-0.5 flex items-start gap-1">
                          <AlertTriangle className="size-3 shrink-0 mt-0.5" /> {run.error}
                        </div>
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {new Date(run.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
