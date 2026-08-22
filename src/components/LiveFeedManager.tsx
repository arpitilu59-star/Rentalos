import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { LiveFeedRecorder } from "./LiveFeedRecorder";
import { VideoPreviewModal } from "./VideoPreviewModal";
import {
  deleteLiveVideo,
  listMyLiveVideos,
  getOwnLiveFeedVideoUrl,
  type LiveFeedTarget,
} from "@/lib/live-feed.functions";
import {
  Video,
  Plus,
  Trash2,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Loader2,
  Play,
} from "lucide-react";

type Row = {
  id: string;
  storage_path: string;
  verification_status: string;
  distance_m: number | null;
  random_prompt: string;
  duration_seconds: number | null;
  created_at: string;
};

const STATUS_LABEL: Record<string, string> = {
  verified: "Verified",
  pending: "Pending review",
  flagged: "Flagged for review",
  rejected: "Rejected",
};

export function LiveFeedManager({
  target,
  label = "Live verified video",
}: {
  target: LiveFeedTarget;
  label?: string;
}) {
  const list = useServerFn(listMyLiveVideos);
  const del = useServerFn(deleteLiveVideo);
  const signOwn = useServerFn(getOwnLiveFeedVideoUrl);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [openRec, setOpenRec] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [busyWatch, setBusyWatch] = useState<string | null>(null);
  const [watching, setWatching] = useState<string | null>(null);
  const [watchUrl, setWatchUrl] = useState<string | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await list({ data: { target } });
      setRows(r as Row[]);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [target.kind, target.id]);

  const remove = async (id: string) => {
    if (!confirm("Delete this video?")) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      await load();
    } finally {
      setBusy(null);
    }
  };

  const watch = async (id: string) => {
    setBusyWatch(id);
    setWatching(id);
    setWatchError(null);
    setWatchUrl(null);
    try {
      const { url } = await signOwn({ data: { id } });
      setWatchUrl(url);
    } catch (e) {
      // Meaningful error inline, not a silent failure or a crash — and no
      // storage internals leaked to the UI (see server-side console.error
      // in getOwnLiveFeedVideoUrl for the real details).
      setWatchError(e instanceof Error ? e.message : "Could not load this video.");
    } finally {
      setBusyWatch(null);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium inline-flex items-center gap-1.5">
          <Video className="size-4 text-primary" /> {label}
        </div>
        <button
          onClick={() => setOpenRec(true)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground"
        >
          <Plus className="size-3" /> Record
        </button>
      </div>

      {rows === null ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No live videos yet. Record one to earn the "Live verified" badge.
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.id} className="py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {r.verification_status === "verified" && (
                    <ShieldCheck className="size-3.5 text-green-500 shrink-0" />
                  )}
                  {r.verification_status === "pending" && (
                    <Clock className="size-3.5 text-amber-500 shrink-0" />
                  )}
                  {(r.verification_status === "flagged" ||
                    r.verification_status === "rejected") && (
                    <AlertTriangle className="size-3.5 text-destructive shrink-0" />
                  )}
                  <span>{STATUS_LABEL[r.verification_status] ?? r.verification_status}</span>
                  <span className="text-muted-foreground truncate">
                    · {new Date(r.created_at).toLocaleDateString()}
                    {r.distance_m != null && ` · ${Math.round(r.distance_m)}m`}
                    {r.duration_seconds ? ` · ${r.duration_seconds}s` : ""}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    disabled={busyWatch === r.id}
                    onClick={() => watch(r.id)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border hover:bg-accent disabled:opacity-50"
                  >
                    {busyWatch === r.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Play className="size-3" />
                    )}{" "}
                    Watch
                  </button>
                  <button
                    disabled={busy === r.id}
                    onClick={() => remove(r.id)}
                    className="p-1 rounded-md text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {busy === r.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Trash2 className="size-3" />
                    )}
                  </button>
                </div>
              </div>
              {watching === r.id && watchError && (
                <div className="mt-1.5 text-[11px] text-destructive">{watchError}</div>
              )}
            </li>
          ))}
        </ul>
      )}

      {openRec && (
        <LiveFeedRecorder
          target={target}
          onClose={() => setOpenRec(false)}
          onSuccess={() => {
            setOpenRec(false);
            load();
          }}
        />
      )}

      {watching && watchUrl && (
        <VideoPreviewModal
          url={watchUrl}
          caption="Your recording — only visible to you"
          onClose={() => {
            setWatching(null);
            setWatchUrl(null);
            setWatchError(null);
          }}
        />
      )}
    </div>
  );
}
