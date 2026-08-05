import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { createMoveRecord, listMoveRecords } from "@/lib/landlord-ops.functions";
import { LogIn, LogOut, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/moves")({ component: MovesPage });

function MovesPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listMoveRecords);
  const create = useServerFn(createMoveRecord);

  const list = useQuery({ queryKey: ["moves"], queryFn: () => fetchList() });

  const [tenantId, setTenantId] = useState("");
  const [roomId, setRoomId] = useState("");
  const [kind, setKind] = useState<"move_in" | "move_out">("move_in");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await create({
        data: {
          tenant_id: tenantId,
          room_id: roomId,
          kind,
          move_date: date,
          meter_reading: reading ? Number(reading) : null,
          condition_notes: notes,
          photo_paths: [],
          checklist: {},
        },
      });
      setTenantId(""); setRoomId(""); setReading(""); setNotes("");
      qc.invalidateQueries({ queryKey: ["moves"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Move-in / Move-out</h1>
          <p className="text-muted-foreground mt-1 text-sm">Record handover with meter reading and condition.</p>
        </header>

        <form onSubmit={submit} className="rounded-2xl bg-card border border-border p-5 shadow-card space-y-3">
          <div className="font-semibold text-sm">New record</div>
          <div className="grid sm:grid-cols-2 gap-2">
            <button type="button" onClick={() => setKind("move_in")} className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm ${kind === "move_in" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>
              <LogIn className="size-4" /> Move-in
            </button>
            <button type="button" onClick={() => setKind("move_out")} className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-sm ${kind === "move_out" ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}>
              <LogOut className="size-4" /> Move-out
            </button>
          </div>
          <input required value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID (UUID)" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm font-mono" />
          <input required value={roomId} onChange={(e) => setRoomId(e.target.value)} placeholder="Room ID (UUID)" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm font-mono" />
          <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <input type="number" step="0.01" value={reading} onChange={(e) => setReading(e.target.value)} placeholder="Meter reading" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condition notes" rows={2} className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        </form>

        <div className="space-y-2">
          {list.isLoading ? <Loader2 className="size-5 animate-spin" /> :
            (list.data?.items ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No move records.</p> :
            (list.data?.items ?? []).map((m: any) => (
              <div key={m.id} className="rounded-xl border border-border bg-card p-4 text-sm">
                <div className="flex justify-between gap-2">
                  <div>
                    <span className="font-medium">{m.kind === "move_in" ? "Move-in" : "Move-out"}</span>
                    {m.tenants?.name && <span className="ml-2">{m.tenants.name}</span>}
                    {m.rooms?.room_number && <span className="text-muted-foreground"> · Room {m.rooms.room_number}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground">{m.move_date}</div>
                </div>
                {m.meter_reading != null && <div className="text-xs text-muted-foreground mt-1">Meter: {m.meter_reading}</div>}
                {m.condition_notes && <div className="text-xs mt-1">{m.condition_notes}</div>}
              </div>
            ))
          }
        </div>
      </div>
    </AppShell>
  );
}
