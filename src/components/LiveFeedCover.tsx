import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play, ShieldCheck, X, Clock } from "lucide-react";
import { getCoverVideoId, getVerifiedVideoUrl, type LiveFeedTarget } from "@/lib/live-feed.functions";

type Props = {
  target: LiveFeedTarget;
  fallback?: string | null;
  alt?: string;
  aspectClass?: string;
  className?: string;
  /** show "Verifying" state instead of nothing when there is no verified video yet */
  showPendingState?: boolean;
};

// Simple in-memory cache to avoid re-hitting server for grid cards
const idCache = new Map<string, string | null>();
const urlCache = new Map<string, string>();

export function LiveFeedCover({ target, fallback, alt, aspectClass = "aspect-[4/5]", className = "", showPendingState = false }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const getId = useServerFn(getCoverVideoId);
  const getUrl = useServerFn(getVerifiedVideoUrl);

  const cacheKey = `${target.kind}:${target.id}`;
  const [videoId, setVideoId] = useState<string | null | undefined>(() => idCache.get(cacheKey));
  const [url, setUrl] = useState<string | null>(() => (idCache.get(cacheKey) ? urlCache.get(idCache.get(cacheKey)!) ?? null : null));
  const [inView, setInView] = useState(false);
  const [expanded, setExpanded] = useState(false);

  // IntersectionObserver — only autoplay if in viewport
  useEffect(() => {
    const el = rootRef.current;
    if (!el || typeof IntersectionObserver === "undefined") { setInView(true); return; }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => setInView(e.isIntersecting)),
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Resolve verified video id, then signed URL — only after in-view (lazy)
  useEffect(() => {
    if (!inView || videoId !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const { id } = await getId({ data: { target } });
        if (cancelled) return;
        idCache.set(cacheKey, id);
        setVideoId(id);
        if (id) {
          const cached = urlCache.get(id);
          if (cached) { setUrl(cached); return; }
          const { url: u } = await getUrl({ data: { id } });
          if (cancelled) return;
          if (u) { urlCache.set(id, u); setUrl(u); }
        }
      } catch { /* ignore — fall back to image */ }
    })();
    return () => { cancelled = true; };
  }, [inView, videoId, cacheKey, target, getId, getUrl]);

  // Play/pause based on viewport + loop first ~8s
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !url) return;
    if (inView) v.play().catch(() => {});
    else v.pause();
  }, [inView, url]);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v && v.currentTime > 8) v.currentTime = 0;
  };

  const hasVideo = !!url;
  const isPending = videoId === null && showPendingState;

  return (
    <>
      <div ref={rootRef} className={`relative overflow-hidden bg-muted ${aspectClass} ${className}`}
        onClick={(e) => { if (hasVideo) { e.preventDefault(); e.stopPropagation(); setExpanded(true); } }}>
        {hasVideo ? (
          <video
            ref={videoRef}
            src={url}
            muted
            loop
            playsInline
            preload="metadata"
            onTimeUpdate={onTimeUpdate}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : fallback ? (
          <img src={fallback} alt={alt || ""} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground text-xs">No preview</div>
        )}

        {hasVideo && (
          <>
            <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-medium">
              <span className="relative inline-flex size-2">
                <span className="absolute inset-0 rounded-full bg-green-400 opacity-70 animate-ping" />
                <span className="relative inline-flex size-2 rounded-full bg-green-400" />
              </span>
              Live verified
            </div>
            <div className="absolute bottom-2 right-2 size-7 grid place-items-center rounded-full bg-black/60 backdrop-blur text-white">
              <Play className="size-3.5 fill-current" />
            </div>
          </>
        )}
        {!hasVideo && isPending && (
          <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/90 text-white text-[10px] font-medium">
            <Clock className="size-3" /> Verifying
          </div>
        )}
      </div>

      {expanded && url && (
        <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4" onClick={() => setExpanded(false)}>
          <div className="relative w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setExpanded(false)} className="absolute -top-10 right-0 text-white p-1"><X className="size-5" /></button>
            <video src={url} controls autoPlay playsInline className="w-full rounded-xl bg-black" />
            <div className="mt-2 inline-flex items-center gap-1 text-white/90 text-xs">
              <ShieldCheck className="size-3 text-green-400" /> Recorded live at the property
            </div>
          </div>
        </div>
      )}
    </>
  );
}
