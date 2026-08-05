import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { TenantShell } from "@/components/TenantShell";
import { supabase } from "@/integrations/supabase/client";
import { listNotifications, markNotificationRead } from "@/lib/notifications.functions";
import { Bell, Check, Loader2 } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/notifications")({ component: Page });

function Page() {
  return (
    <TenantShell>
      <NotifList />
    </TenantShell>
  );
}

export function NotifList() {
  const list = useServerFn(listNotifications);
  const mark = useServerFn(markNotificationRead);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["notifications"], queryFn: () => list() });

  useEffect(() => {
    const ch = supabase.channel("notif")
      .on("postgres_changes", { event: "*", schema: "public", table: "myr_notifications" }, () => {
        qc.invalidateQueries({ queryKey: ["notifications"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const markAll = async () => { await mark({ data: { all: true } }); qc.invalidateQueries({ queryKey: ["notifications"] }); };
  const markOne = async (id: string) => { await mark({ data: { id } }); qc.invalidateQueries({ queryKey: ["notifications"] }); };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Bell className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Notifications</h1></div>
        {(data?.unread ?? 0) > 0 && (
          <button onClick={markAll} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent inline-flex items-center gap-1">
            <Check className="size-3" /> Mark all read
          </button>
        )}
      </div>
      {isLoading ? (
        <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : !data?.items?.length ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">Koi notification nahi.</div>
      ) : (
        <div className="space-y-2">
          {data.items.map((n: any) => (
            <Link to={n.link ?? "."} key={n.id} onClick={() => !n.read_at && markOne(n.id)}
              className={`block rounded-xl p-3 border ${n.read_at ? "border-border bg-card" : "border-primary/40 bg-primary/5"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium text-sm">{n.title}</div>
                  {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                </div>
                <div className="text-[10px] text-muted-foreground whitespace-nowrap">{new Date(n.created_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
