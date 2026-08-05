import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getTenantDashboard, createTenantTicket } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, Wrench, Plus } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/maintenance")({ component: Page });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/maintenance" });
  const qc = useQueryClient();
  const fetch = useServerFn(getTenantDashboard);
  const create = useServerFn(createTenantTicket);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      await create({ data: { tenant_id: tenantId, title, description: desc || undefined, priority } });
      setTitle(""); setDesc(""); setPriority("medium"); setOpen(false);
      await qc.invalidateQueries({ queryKey: ["tenant-dash", tenantId] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally { setBusy(false); }
  };

  return (
    <TenantShell>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2"><Wrench className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Maintenance</h1></div>
        <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground"><Plus className="size-3.5" /> New ticket</button>
      </div>

      {open && (
        <form onSubmit={submit} className="rounded-2xl bg-card border border-border p-4 mb-4 space-y-2 max-w-xl">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Issue title" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe the issue" rows={3} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <select value={priority} onChange={(e) => setPriority(e.target.value as any)} className="px-3 py-2 rounded-lg bg-background border border-input text-sm">
            <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
          <button disabled={busy} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-50">{busy ? <Loader2 className="size-3 animate-spin" /> : null} Submit</button>
        </form>
      )}

      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !data?.tickets?.length ? <div className="py-20 text-center text-sm text-muted-foreground">No tickets.</div>
      : (
        <div className="space-y-2">
          {data.tickets.map((t: any) => (
            <div key={t.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{t.title}</div>
                  {t.description && <div className="text-xs text-muted-foreground line-clamp-2">{t.description}</div>}
                  <div className="text-[11px] text-muted-foreground mt-1">{new Date(t.created_at).toLocaleString("en-IN")}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${t.status === "resolved" ? "bg-success text-success-foreground" : t.status === "in_progress" ? "bg-primary/10 text-primary" : "bg-warning text-warning-foreground"}`}>{t.status}</span>
                  <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-accent text-accent-foreground">{t.priority}</span>
                </div>
              </div>
              {t.resolution_notes && <div className="mt-2 text-xs border-t border-border pt-2 text-muted-foreground">Resolution: {t.resolution_notes}</div>}
            </div>
          ))}
        </div>
      )}
    </TenantShell>
  );
}
