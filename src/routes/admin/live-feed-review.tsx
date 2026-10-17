import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ResilientVideo } from "@/components/ResilientVideo";
import {
  listPendingLiveFeedVideos,
  signLiveFeedVideoForAdmin,
  decideLiveFeedVideo,
  listPendingLivePhotos,
  decideLivePhoto,
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
    setBusy(id);
    try {
      const { url } = await sign({ data: { id } });
      setPlaying({ id, url });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't load the video.");
    } finally {
      setBusy(null);
    }
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
      toast.error(e instanceof Error ? e.message : "Couldn't save the decision.");
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
                <div className="relative mt-2 aspect-[9/16] max-h-[70vh] rounded-lg overflow-hidden bg-black">
                  <ResilientVideo
                    src={playing.url}
                    getFreshUrl={async () => (await sign({ data: { id: v.id } })).url}
                    controls
                    autoPlay
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                </div>
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
      <PhotoReview />
    </div>
  );
}

function PhotoReview() {
  const qc = useQueryClient();
  const list = useServerFn(listPendingLivePhotos);
  const decide = useServerFn(decideLivePhoto);
  const q = useQuery({ queryKey: ["lfp-pending"], queryFn: () => list() });
  const [busy, setBusy] = useState<string | null>(null);
  const items = q.data?.items ?? [];
  const act = async (id: string, decision: "verified" | "rejected") => {
    setBusy(id);
    try {
      await decide({ data: { id, decision } });
      await qc.invalidateQueries({ queryKey: ["lfp-pending"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the decision.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Live photos to review</h2>
      <p className="text-xs text-muted-foreground">
        Photos taken within 50 m of the property are verified automatically. These are the ones without GPS data for the
        property or taken far away.
      </p>
      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos waiting.</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {items.map((p) => (
            <div key={p.id} className="rounded-xl border border-border bg-card overflow-hidden">
              <a href={p.url} target="_blank" rel="noreferrer">
                <img src={p.url} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover" />
              </a>
              <div className="p-2 space-y-2 text-[11px] text-muted-foreground">
                <div>
                  {p.verification_status}
                  {p.distance_m != null ? ` · ${Math.round(p.distance_m)} m from property` : " · no property GPS"}
                </div>
                <div className="flex gap-1.5">
                  <button
                    disabled={busy === p.id}
                    onClick={() => act(p.id, "verified")}
                    className="flex-1 rounded-md bg-primary text-primary-foreground py-1.5 text-xs disabled:opacity-50"
                  >
                    Verify
                  </button>
                  <button
                    disabled={busy === p.id}
                    onClick={() => act(p.id, "rejected")}
                    className="flex-1 rounded-md border border-destructive/30 text-destructive py-1.5 text-xs disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
