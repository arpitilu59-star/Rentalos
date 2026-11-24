import { recordRoomEvent } from "@/lib/room-engagement";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, ShieldCheck, Clock, Video, RefreshCw } from "lucide-react";
import { ResilientVideo } from "./ResilientVideo";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import {
  getCoverVideoId,
  getVerifiedVideoUrl,
  type LiveFeedTarget,
} from "@/lib/live-feed.functions";
import { EMPTY_VIDEO_ASSETS, type VideoAssets } from "@/lib/video-media";

type Props = {
  target: LiveFeedTarget;
  fallback?: string | null;
  alt?: string;
  aspectClass?: string;
  className?: string;
  showPendingState?: boolean;
  mode?: "preview" | "full";
  expandOnClick?: boolean;
};

export function LiveFeedCover({
  target,
  fallback,
  alt,
  aspectClass = "aspect-[4/5]",
  className = "",
  showPendingState = false,
  mode = "preview",
  expandOnClick = true,
}: Props) {
  const root = useRef<HTMLDivElement>(null);
  const getId = useServerFn(getCoverVideoId),
    getUrl = useServerFn(getVerifiedVideoUrl);
  const api = useRef({ getId, getUrl });
  api.current = { getId, getUrl };
  const [near, setNear] = useState(false),
    [inView, setInView] = useState(false);
  const [reduced, setReduced] = useState(false),
    [visible, setVisible] = useState(true);
  const [expanded, setExpanded] = useState(false),
    [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    id: string | null;
    assets: VideoAssets;
    error: boolean;
    loaded: boolean;
  }>({
    key: "",
    id: null,
    assets: EMPTY_VIDEO_ASSETS,
    error: false,
    loaded: false,
  });
  useEffect(() => {
    if (target.kind !== "room" || !(expanded || mode === "full")) return;
    const timer = setTimeout(() => {
      if (!document.hidden) void recordRoomEvent(target.id, "view");
    }, 3000);
    return () => clearTimeout(timer);
  }, [expanded, mode, target.kind, target.id]);
  const completed = () => {
    if (target.kind === "room") void recordRoomEvent(target.id, "video_complete");
  };
  const key = `${target.kind}:${target.id}`;
  const isFull = mode === "full";
  const current =
    state.key === key
      ? state
      : { id: null, assets: EMPTY_VIDEO_ASSETS, error: false, loaded: false };
  const poster = current.assets.posterUrl || fallback;

  useEffect(() => {
    const el = root.current;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const motion = () => setReduced(mq.matches);
    const visibility = () => setVisible(!document.hidden);
    motion();
    visibility();
    mq.addEventListener("change", motion);
    document.addEventListener("visibilitychange", visibility);
    let nearObserver: IntersectionObserver | undefined,
      viewObserver: IntersectionObserver | undefined;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setInView(true);
    } else {
      nearObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) setNear(true);
        },
        { rootMargin: "200px 0px" },
      );
      viewObserver = new IntersectionObserver(
        (entries) => setInView(entries[0]?.isIntersecting ?? false),
        { threshold: 0.4 },
      );
      nearObserver.observe(el);
      viewObserver.observe(el);
    }
    return () => {
      nearObserver?.disconnect();
      viewObserver?.disconnect();
      mq.removeEventListener("change", motion);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, []);

  // Resolve once per target, revalidate on focus/visibility and after upload events.
  // Do not cache a missing video for the entire browser session.
  useEffect(() => {
    if (!near) return;
    let cancelled = false;
    let request = 0;
    const load = async () => {
      const serial = ++request;
      try {
        const { id } = await api.current.getId({
          data: { target: { kind: target.kind, id: target.id } },
        });
        const assets = id ? await api.current.getUrl({ data: { id } }) : { ...EMPTY_VIDEO_ASSETS };
        if (!cancelled && serial === request)
          setState((old) => ({
            key,
            id,
            // A newly signed URL for the same recording must not remount/reset the player.
            // Expired URL retries are handled by ResilientVideo; a changed ID replaces media.
            assets:
              old.key === key && old.id === id && old.assets.url && assets.url
                ? old.assets
                : assets,
            error: !!id && !assets.url,
            loaded: true,
          }));
      } catch {
        if (!cancelled && serial === request)
          setState((old) => ({
            ...(old.key === key ? old : { key, id: null, assets: EMPTY_VIDEO_ASSETS }),
            error: true,
            loaded: true,
          }));
      }
    };
    void load();
    const refresh = () => {
      if (!document.hidden) void load();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("room-video-updated", refresh);
    const timer = setInterval(refresh, 60000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("room-video-updated", refresh);
    };
  }, [near, key, target.id, target.kind, retry]);

  const fresh = useCallback(
    async (preview: boolean) => {
      if (!current.id) return null;
      const assets = await api.current.getUrl({ data: { id: current.id } });
      return preview ? assets.previewUrl : assets.url;
    },
    [current.id],
  );
  const source = isFull ? current.assets.url : current.assets.previewUrl;
  const canExpand = !isFull && expandOnClick && !!current.assets.url;

  return (
    <>
      <div ref={root} className={`relative overflow-hidden bg-muted ${aspectClass} ${className}`}>
        {poster && (
          <img
            src={poster}
            alt={alt || ""}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        {source ? (
          <ResilientVideo
            key={`${key}:${mode}`}
            src={source}
            getFreshUrl={() => fresh(!isFull)}
            poster={poster}
            muted={!isFull}
            loop={!isFull}
            controls={isFull}
            onComplete={isFull ? completed : undefined}
            playing={isFull ? undefined : inView && visible && !reduced && !expanded}
            ariaLabel={alt ? `Video of ${alt}` : "Room video"}
            className={`absolute inset-0 w-full h-full ${isFull ? "object-contain bg-black" : "object-cover"}`}
          />
        ) : current.error ? (
          <div
            className="absolute inset-0 grid place-items-center bg-black/60 text-white text-center p-3"
            role="status"
          >
            <div>
              <p className="text-sm">Could not load this video.</p>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRetry((n) => n + 1);
                }}
                className="inline-flex min-h-11 items-center gap-2 px-3 focus-visible:outline focus-visible:outline-2"
              >
                <RefreshCw className="size-4" />
                Try again
              </button>
            </div>
          </div>
        ) : (
          !poster && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs p-3">
              {!current.loaded && near ? (
                <span role="status">Loading video...</span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Video className="size-4" />
                  Video coming soon
                </span>
              )}
            </div>
          )
        )}
        {source && (
          <div className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/70 text-white text-[10px]">
            <ShieldCheck className="size-3 text-green-400" />
            {isFull ? "Recorded live at the property" : "Live verified"}
          </div>
        )}
        {canExpand && (
          <button
            type="button"
            aria-label="Watch full room video"
            onClick={() => setExpanded(true)}
            className="absolute bottom-2 right-2 min-h-11 min-w-11 grid place-items-center rounded-full bg-black/70 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <Play className="size-5" />
          </button>
        )}
        {!source && current.loaded && !current.error && showPendingState && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500 text-black text-[10px]">
            <Clock className="size-3" />
            Video being verified
          </div>
        )}
      </div>
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="max-w-xl bg-black text-white border-white/20">
          <DialogTitle>Full room video</DialogTitle>
          {expanded && current.assets.url && (
            <div className="relative aspect-[4/5] max-h-[75vh] overflow-hidden">
              <ResilientVideo
                src={current.assets.url}
                getFreshUrl={() => fresh(false)}
                controls
                autoPlay
                poster={poster}
                onComplete={completed}
                ariaLabel="Full room video"
                className="absolute inset-0 w-full h-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
