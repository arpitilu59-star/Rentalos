import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { createTicket, listTickets, updateTicketStatus } from "@/lib/landlord-ops.functions";
import { Wrench, Loader2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/maintenance")({ component: MaintenancePage });

function MaintenancePage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listTickets);
  const create = useServerFn(createTicket);
  const update = useServerFn(updateTicketStatus);

  const list = useQuery({ queryKey: ["tickets"], queryFn: () => fetchList() });

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await create({ data: { title, description: desc, priority, photo_paths: [] } });
      setTitle(""); setDesc(""); setPriority("medium");
      qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const setStatus = async (id: string, status: "open" | "in_progress" | "resolved" | "closed") => {
    const notes = status === "resolved" ? prompt("Resolution notes?") || undefined : undefined;
    await update({ data: { id, status, resolution_notes: notes } });
    qc.invalidateQueries({ queryKey: ["tickets"] });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Wrench className="size-6 text-primary" /> Maintenance tickets
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Track property complaints and repair requests.</p>
        </header>

        <form onSubmit={submit} className="rounded-2xl bg-card border border-border p-5 shadow-card space-y-3">
          <div className="font-semibold text-sm">New ticket</div>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title (e.g. Leaking tap)" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description" rows={2} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm">
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Create ticket
          </button>
        </form>

        <div className="space-y-2">
          {list.isLoading ? <Loader2 className="size-5 animate-spin" /> :
            (list.data?.items ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No tickets yet.</p> :
            (list.data?.items ?? []).map((t: any) => (
              <div key={t.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {t.priority === "urgent" && <AlertCircle className="size-4 text-destructive" />}
                      {t.title}
                    </div>
                    {t.description && <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>}
                    <div className="text-[11px] text-muted-foreground mt-1">
                      {t.rooms?.room_number && <>Room {t.rooms.room_number} · </>}
                      {t.tenants?.name && <>{t.tenants.name} · </>}
                      <span className={`px-1.5 py-0.5 rounded ${t.priority === "urgent" || t.priority === "high" ? "bg-destructive/10 text-destructive" : "bg-accent"}`}>{t.priority}</span>
                    </div>
                  </div>
                  <span className={`text-[10px] px-2 py-1 rounded shrink-0 ${t.status === "resolved" || t.status === "closed" ? "bg-emerald-500/10 text-emerald-600" : t.status === "in_progress" ? "bg-amber-500/10 text-amber-600" : "bg-accent"}`}>
                    {t.status.replace("_", " ")}
                  </span>
                </div>
                {t.resolution_notes && <div className="text-xs text-muted-foreground italic">Resolution: {t.resolution_notes}</div>}
                <div className="flex gap-1 flex-wrap">
                  {(["open", "in_progress", "resolved", "closed"] as const).filter((s) => s !== t.status).map((s) => (
                    <button key={s} onClick={() => setStatus(t.id, s)} className="text-[11px] px-2 py-1 rounded border border-border hover:bg-accent">
                      → {s.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>
            ))
          }
        </div>
      </div>
    </AppShell>
  );
}
