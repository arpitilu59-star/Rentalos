import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listPendingLiveFeedVideos,
  signLiveFeedVideoForAdmin,
  decideLiveFeedVideo,
} from "@/lib/live-feed-admin.functions";
import { Video, Play, Check, X, Loader2, MapPin, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/admin/live-feed-review")({ component: LiveFeedReview });

function LiveFeedReview() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingLiveFeedVideos);
  const sign = useServerFn(signLiveFeedVideoForAdmin);
  const decide = useServerFn(decideLiveFeedVideo);
  const [busy, setBusy] = useState<string | null>(null);
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null);

  const q = useQuery({ queryKey: ["lfv-pending"], queryFn: () => list() });

  const watch = async (id: string) => {
    const { url } = await sign({ data: { id } });
    setPlaying({ id, url });
  };

  const act = async (id: string, decision: "verified" | "rejected") => {
    setBusy(id);
    try {
      const reason =
        decision === "rejected" ? (prompt("Reject reason (optional):") ?? undefined) : undefined;
      await decide({ data: { id, decision, reason } });
      setPlaying(null);
      qc.invalidateQueries({ queryKey: ["lfv-pending"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const items = q.data?.items ?? [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Video className="size-5 text-primary" /> Live feed review
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          GPS distance is a signal, not a verdict — watch the clip before deciding. Verifying sets a
          150-day expiry; the listing loses its "Verified" badge automatically after that unless
          re-recorded.
        </p>
      </div>

      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing pending review.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {items.map((v) => (
            <div key={v.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${v.verification_status === "flagged" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}
                >
                  {v.verification_status}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>

              <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                <div>
                  Prompt: <span className="text-foreground">{v.random_prompt}</span>
                </div>
                <div>Duration: {v.duration_seconds}s</div>
                {v.distance_m != null && (
                  <div
                    className={`inline-flex items-center gap-1 ${v.distance_m > 50 ? "text-destructive" : "text-emerald-600"}`}
                  >
                    <MapPin className="size-3" /> {Math.round(v.distance_m)}m from registered
                    location
                    {v.distance_m > 50 && <AlertTriangle className="size-3" />}
                  </div>
                )}
                {v.distance_m == null && (
                  <div className="text-muted-foreground/70">
                    No GPS signal available for this target — review the video itself.
                  </div>
                )}
              </div>

              <button
                onClick={() => watch(v.id)}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 text-xs px-3 py-2 rounded-md border border-border hover:bg-accent"
              >
                <Play className="size-3.5" /> Watch clip
              </button>

              {playing?.id === v.id && (
                <video
                  src={playing.url}
                  controls
                  autoPlay
                  className="w-full rounded-lg mt-2 bg-black"
                />
              )}

              <div className="flex gap-2 mt-3">
                <button
                  disabled={busy === v.id}
                  onClick={() => act(v.id, "verified")}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-60"
                >
                  {busy === v.id ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Check className="size-3.5" />
                  )}{" "}
                  Verify
                </button>
                <button
                  disabled={busy === v.id}
                  onClick={() => act(v.id, "rejected")}
                  className="flex-1 inline-flex items-center justify-center gap-1 text-xs px-3 py-2 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  <X className="size-3.5" /> Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
