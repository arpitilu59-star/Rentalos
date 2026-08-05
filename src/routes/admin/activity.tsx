import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listRecentActivity } from "@/lib/admin-monitoring.functions";
import { Activity, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/activity")({ component: ActivityPage });

function ActivityPage() {
  const fetchList = useServerFn(listRecentActivity);
  const q = useQuery({ queryKey: ["admin-activity"], queryFn: () => fetchList() });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><Activity className="size-5 text-primary" /> User activity</h1>
        <p className="text-xs text-muted-foreground mt-1">Recent platform-wide activity stream.</p>
      </div>

      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> :
        (q.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
        ) : (
          <div className="rounded-xl border border-border bg-card divide-y divide-border">
            {q.data!.items.map((e: any) => (
              <div key={e.id} className="px-4 py-3 text-sm flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{e.action}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {e.profile?.full_name || e.profile?.email || e.user_id}
                    {e.target_type && <> · {e.target_type}{e.target_id ? `:${e.target_id.slice(0, 8)}` : ""}</>}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground shrink-0">{new Date(e.created_at).toLocaleString("en-IN")}</div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}
