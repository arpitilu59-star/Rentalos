import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LiveFeedRecorder } from "./LiveFeedRecorder";
import { deleteLiveVideo, listMyLiveVideos, type LiveFeedTarget } from "@/lib/live-feed.functions";
import { Video, Plus, Trash2, ShieldCheck, Clock, AlertTriangle, Loader2 } from "lucide-react";

type Row = {
  id: string;
  storage_path: string;
  verification_status: string;
  distance_m: number | null;
  random_prompt: string;
  duration_seconds: number | null;
  created_at: string;
};

export function LiveFeedManager({ target, label = "Live verified video" }: { target: LiveFeedTarget; label?: string }) {
  const list = useServerFn(listMyLiveVideos);
  const del = useServerFn(deleteLiveVideo);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openRec, setOpenRec] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await list({ data: { target } });
      setRows(r as Row[]);
    } catch { setRows([]); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [target.kind, target.id]);

  const remove = async (id: string) => {
    if (!confirm("Delete this video?")) return;
    setBusy(id);
    try { await del({ data: { id } }); await load(); } finally { setBusy(null); }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium inline-flex items-center gap-1.5"><Video className="size-4 text-primary" /> {label}</div>
        <button onClick={() => setOpenRec(true)} className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground">
          <Plus className="size-3" /> Record
        </button>
      </div>

      {rows === null ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 className="size-3 animate-spin" /> Loading…</div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">No live videos yet. Record one to earn the "Live verified" badge.</div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between py-1.5 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                {r.verification_status === "verified" && <ShieldCheck className="size-3.5 text-green-500 shrink-0" />}
                {r.verification_status === "pending" && <Clock className="size-3.5 text-amber-500 shrink-0" />}
                {(r.verification_status === "flagged" || r.verification_status === "rejected") && <AlertTriangle className="size-3.5 text-destructive shrink-0" />}
                <span className="capitalize">{r.verification_status}</span>
                <span className="text-muted-foreground truncate">
                  · {new Date(r.created_at).toLocaleDateString()}
                  {r.distance_m != null && ` · ${Math.round(r.distance_m)}m`}
                  {r.duration_seconds ? ` · ${r.duration_seconds}s` : ""}
                </span>
              </div>
              <button disabled={busy === r.id} onClick={() => remove(r.id)} className="p-1 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50">
                {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
              </button>
            </li>
          ))}
        </ul>
      )}

      {openRec && <LiveFeedRecorder target={target} onClose={() => setOpenRec(false)} onSuccess={() => { setOpenRec(false); load(); }} />}
    </div>
  );
}
