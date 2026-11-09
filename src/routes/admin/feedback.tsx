import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { adminFunnel, adminListFeedback, adminUpdateFeedback } from "@/lib/product.functions";

export const Route = createFileRoute("/admin/feedback")({ component: AdminFeedback });

const STATUSES = ["open", "in_progress", "resolved", "wont_fix"] as const;

function AdminFeedback() {
  const qc = useQueryClient();
  const [status, setStatus] = useState<"open" | "in_progress" | "resolved" | "wont_fix" | "all">("open");
  const list = useServerFn(adminListFeedback);
  const upd = useServerFn(adminUpdateFeedback);
  const funnelFn = useServerFn(adminFunnel);
  const q = useQuery({ queryKey: ["admin-feedback", status], queryFn: () => list({ data: { status } }), retry: false });
  const f = useQuery({ queryKey: ["admin-funnel"], queryFn: () => funnelFn({ data: { days: 30 } }), retry: false });
  const m = useMutation({
    mutationFn: (v: { id: string; status: (typeof STATUSES)[number]; notes?: string }) => upd({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-feedback"] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Feedback & product analytics</h1>
        <p className="text-sm text-muted-foreground">User-submitted bugs/ideas and an activation funnel (last 30 days, first-party events only).</p>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4 space-y-2">
        <h2 className="text-sm font-semibold">Activation funnel (distinct users)</h2>
        {f.isLoading ? (
          <p className="text-xs text-muted-foreground">Loading…</p>
        ) : f.error ? (
          <p className="text-xs text-destructive">Couldn't load analytics (migration applied?).</p>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {f.data!.funnel.map((s) => (
                <div key={s.event} className="rounded-xl border p-3">
                  <div className="text-[11px] text-muted-foreground">{s.event.replace(/_/g, " ")}</div>
                  <div className="text-xl font-semibold">{s.users}</div>
                </div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Active users with any event: {f.data!.activeUsers}
              {f.data!.truncated ? " (sample truncated at 50k events)" : ""}. Events only count from when tracking was deployed.
            </p>
          </>
        )}
      </section>

      <div className="flex flex-wrap gap-2">
        {(["open", "in_progress", "resolved", "wont_fix", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`rounded-full border px-3 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground" : ""}`}
          >
            {s.replace("_", " ")}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : q.error ? (
        <p className="text-sm text-destructive">Couldn't load feedback.</p>
      ) : q.data!.items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {q.data!.items.map((it) => (
            <li key={it.id} className="rounded-2xl border border-border bg-card p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <b className="text-foreground uppercase">{it.kind}</b>
                <span>{it.role}</span>
                <span>{it.platform}{it.app_version ? ` ${it.app_version}` : ""}</span>
                {it.screen && <span>@ {it.screen}</span>}
                <span>{new Date(it.created_at).toLocaleString()}</span>
              </div>
              <p className="text-sm whitespace-pre-wrap">{it.body}</p>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-md border bg-background px-2 py-1 text-xs"
                  value={it.status}
                  onChange={(e) => m.mutate({ id: it.id, status: e.target.value as (typeof STATUSES)[number] })}
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{s.replace("_", " ")}</option>
                  ))}
                </select>
                <input
                  className="flex-1 rounded-md border bg-background px-2 py-1 text-xs"
                  placeholder="Admin note (saved on blur)"
                  defaultValue={it.admin_notes ?? ""}
                  maxLength={2000}
                  onBlur={(e) => e.target.value !== (it.admin_notes ?? "") && m.mutate({ id: it.id, status: it.status as (typeof STATUSES)[number], notes: e.target.value })}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
