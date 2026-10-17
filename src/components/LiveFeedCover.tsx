import { useCallback, useEffect, useRef, useState } from "react";
import { ResilientVideo } from "./ResilientVideo";
import { useServerFn } from "@tanstack/react-start";
import { Play, ShieldCheck, X, Clock, Video } from "lucide-react";
import {
  getCoverVideoId,
  getVerifiedVideoUrl,
  type LiveFeedTarget,
} from "@/lib/live-feed.functions";
import { PREVIEW_SECONDS } from "@/lib/video";

type Props = {
  target: LiveFeedTarget;
  fallback?: string | null;
  alt?: string;
  aspectClass?: string;
  className?: string;
  /** show "Verifying" state instead of nothing when there is no verified video yet */
  showPendingState?: boolean;
  /**
   * "preview" (default): muted, looping first PREVIEW_SECONDS — used on cards.
   * "full": complete video with proper controls — used on the room detail page.
   */
  mode?: "preview" | "full";
  /** In preview mode, clicking opens a modal with the full video. Disable when the card itself is a link. */
  expandOnClick?: boolean;
};

// Simple in-memory caches so grid cards don't re-hit the server
const idCache = new Map<string, string | null>();
const urlCache = new Map<string, { url: string; at: number }>();
const URL_TTL_MS = 5 * 60 * 60 * 1000; // signed links last 6h; refresh a bit before
const cachedUrl = (id: string) => {
  const c = urlCache.get(id);
  return c && Date.now() - c.at < URL_TTL_MS ? c.url : null;
};

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

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
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const getId = useServerFn(getCoverVideoId);
  const getUrl = useServerFn(getVerifiedVideoUrl);
  const reducedMotion = usePrefersReducedMotion();
  const isFull = mode === "full";

  const cacheKey = `${target.kind}:${target.id}`;
  const [videoId, setVideoId] = useState<string | null | undefined>(() => idCache.get(cacheKey));
  const [url, setUrl] = useState<string | null>(() =>
    idCache.get(cacheKey) ? cachedUrl(idCache.get(cacheKey)!) : null,
  );
  const [near, setNear] = useState(false); // close to viewport → fetch URL
  const [inView, setInView] = useState(false); // actually visible → play
  const [ready, setReady] = useState(false); // first frame decoded
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // Two observers: a generous margin to start loading just before the card
  // scrolls in, and a tight one to play only while it's actually visible.
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      setInView(true);
      return;
    }
    const nearIo = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setNear(true)),
      { rootMargin: "200px 0px" },
    );
    const viewIo = new IntersectionObserver(
      (entries) => entries.forEach((e) => setInView(e.isIntersecting)),
      { threshold: 0.4 },
    );
    nearIo.observe(el);
    viewIo.observe(el);
    return () => {
      nearIo.disconnect();
      viewIo.disconnect();
    };
  }, []);

  // Resolve verified video id, then signed URL — only once near the viewport (lazy)
  useEffect(() => {
    if (!near || videoId !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const { id } = await getId({ data: { target } });
        if (cancelled) return;
        idCache.set(cacheKey, id);
        setVideoId(id);
        if (id) {
          const cached = cachedUrl(id);
          if (cached) {
            setUrl(cached);
            return;
          }
          const { url: u } = await getUrl({ data: { id } });
          if (cancelled) return;
          if (u) {
            urlCache.set(id, { url: u, at: Date.now() });
            setUrl(u);
          }
        }
      } catch {
        /* fall back to the photo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [near, videoId, cacheKey, target, getId, getUrl]);

  // If the id resolved earlier (cache) but the URL is missing, fetch it.
  useEffect(() => {
    if (!near || !videoId || url) return;
    let cancelled = false;
    (async () => {
      try {
        const { url: u } = await getUrl({ data: { id: videoId } });
        if (!cancelled && u) {
          urlCache.set(videoId, { url: u, at: Date.now() });
          setUrl(u);
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [near, videoId, url, getUrl]);

  // Preview: play only while visible, pause when scrolled away.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url || isFull) return;
    if (inView && !reducedMotion) v.play().catch(() => {});
    else v.pause();
  }, [inView, url, isFull, reducedMotion, ready]);

  const freshUrl = useCallback(async () => {
    if (!videoId) return null;
    urlCache.delete(videoId);
    const { url: u } = await getUrl({ data: { id: videoId } });
    if (u) urlCache.set(videoId, { url: u, at: Date.now() });
    return u ?? null;
  }, [videoId, getUrl]);

  const hasVideo = !!url && !failed;
  const isPending = videoId === null && showPendingState;
  const openFull = () => hasVideo && !isFull && expandOnClick && setExpanded(true);

  return (
    <>
      <div
        ref={rootRef}
        className={`relative overflow-hidden bg-muted ${aspectClass} ${className}`}
        onClick={(e) => {
          if (hasVideo && !isFull && expandOnClick) {
            e.preventDefault();
            e.stopPropagation();
            openFull();
          }
        }}
      >
        {/* Poster / fallback photo is always underneath so there is never an empty flash */}
        {fallback ? (
          <img
            src={fallback}
            alt={alt || ""}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          !hasVideo && (
            <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs gap-1">
              {videoId === undefined && near ? (
                <div className="absolute inset-0 animate-pulse bg-muted" aria-hidden />
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Video className="size-3.5" /> Video coming soon
                </span>
              )}
            </div>
          )
        )}

        {hasVideo && (
          <VideoSlot
            videoRef={videoRef}
            url={url!}
            isFull={isFull}
            ready={ready}
            fallback={fallback}
            alt={alt}
            freshUrl={freshUrl}
            onReady={() => setReady(true)}
            onFailed={() => setFailed(true)}
          />
        )}

        {hasVideo && !isFull && (
          <>
            <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-medium">
              <span className="relative inline-flex size-2">
                <span className="absolute inset-0 rounded-full bg-green-400 opacity-70 animate-ping motion-reduce:hidden" />
                <span className="relative inline-flex size-2 rounded-full bg-green-400" />
              </span>
              Live verified
            </div>
            <div className="absolute bottom-2 right-2 size-7 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white">
              <Play className="size-3.5 fill-current" />
            </div>
          </>
        )}
        {hasVideo && isFull && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-medium pointer-events-none">
            <ShieldCheck className="size-3 text-green-400" /> Recorded live at the property
          </div>
        )}
        {!hasVideo && isPending && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-medium">
            <Clock className="size-3" /> Video being verified
          </div>
        )}
      </div>

      {expanded && url && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Full room video"
          className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4"
          onClick={() => setExpanded(false)}
          onKeyDown={(e) => e.key === "Escape" && setExpanded(false)}
        >
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setExpanded(false)}
              aria-label="Close video"
              className="absolute -top-10 right-0 text-white p-1"
              autoFocus
            >
              <X className="size-5" />
            </button>
            <div className="relative aspect-[9/16] max-h-[80vh] mx-auto rounded-xl overflow-hidden bg-black">
              <ResilientVideo
                src={url}
                getFreshUrl={freshUrl}
                controls
                autoPlay
                poster={fallback}
                ariaLabel="Full room video"
                className="absolute inset-0 w-full h-full object-contain bg-black"
              />
            </div>
            <div className="mt-2 inline-flex items-center gap-1 text-white/90 text-xs">
              <ShieldCheck className="size-3 text-green-400" /> Recorded live at the property
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function VideoSlot({
  videoRef,
  url,
  isFull,
  ready,
  fallback,
  alt,
  freshUrl,
  onReady,
  onFailed,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  url: string;
  isFull: boolean;
  ready: boolean;
  fallback?: string | null;
  alt?: string;
  freshUrl: () => Promise<string | null>;
  onReady: () => void;
  onFailed: () => void;
}) {
  // ResilientVideo owns the <video>; mirror its element into the parent's ref for play/pause control.
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sync = () => {
      (videoRef as React.MutableRefObject<HTMLVideoElement | null>).current =
        wrap.current?.querySelector("video") ?? null;
    };
    sync();
    const mo = new MutationObserver(sync);
    if (wrap.current) mo.observe(wrap.current, { childList: true });
    return () => mo.disconnect();
  }, [videoRef, url]);
  return (
    <div
      ref={wrap}
      className={`absolute inset-0 transition-opacity duration-300 ${ready || isFull ? "opacity-100" : "opacity-0"}`}
    >
      <ResilientVideo
        src={url}
        getFreshUrl={freshUrl}
        poster={fallback}
        muted={!isFull}
        controls={isFull}
        previewSeconds={isFull ? undefined : PREVIEW_SECONDS}
        ariaLabel={alt ? `Video of ${alt}` : "Room video"}
        className={`absolute inset-0 w-full h-full ${isFull ? "object-contain bg-black" : "object-cover"}`}
        onReady={onReady}
        onFailed={onFailed}
      />
    </div>
  );
}
