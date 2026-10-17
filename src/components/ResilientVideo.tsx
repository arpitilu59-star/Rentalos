import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";

type Props = {
  src: string;
  /** Called when the link expired or the load failed once — return a fresh signed URL (or null). */
  getFreshUrl?: () => Promise<string | null>;
  poster?: string | null;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  /** Loop only the first N seconds (card previews). Falls back to native loop for files without a duration. */
  previewSeconds?: number;
  className?: string;
  ariaLabel?: string;
  onReady?: () => void;
  onFailed?: () => void;
};

/**
 * One video element that doesn't leave people staring at a frozen frame:
 *  - spinner while buffering, never a silent stall
 *  - expired signed link or a network blip → fetches a fresh URL once and resumes where it was
 *  - after that, a visible Retry button instead of a dead player
 *  - preview loops use a tight timer + cheap seek (files are duration-patched, so seeking is instant)
 */
export function ResilientVideo({
  src,
  getFreshUrl,
  poster,
  controls,
  muted,
  autoPlay,
  previewSeconds,
  className = "",
  ariaLabel,
  onReady,
  onFailed,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState(src);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const triedFresh = useRef(false);
  const resumeAt = useRef(0);

  useEffect(() => {
    setUrl(src);
    setFailed(false);
    triedFresh.current = false;
  }, [src]);

  const reload = useCallback(
    async (manual: boolean) => {
      const v = ref.current;
      if (v) resumeAt.current = v.currentTime || 0;
      if (getFreshUrl && (!triedFresh.current || manual)) {
        triedFresh.current = true;
        setBuffering(true);
        setFailed(false);
        try {
          const fresh = await getFreshUrl();
          if (fresh) {
            setUrl(fresh);
            return;
          }
        } catch {
          /* fall through to failed */
        }
      } else if (manual) {
        setFailed(false);
        setBuffering(true);
        setUrl((u) => u + (u.includes("?") ? "&" : "?") + "r=" + Date.now());
        return;
      }
      setFailed(true);
      setBuffering(false);
      onFailed?.();
    },
    [getFreshUrl, onFailed],
  );

  // Card preview: loop the first N seconds without relying on coarse timeupdate events.
  useEffect(() => {
    if (!previewSeconds) return;
    const t = setInterval(() => {
      const v = ref.current;
      if (!v || v.paused || !Number.isFinite(v.duration)) return;
      if (v.currentTime >= Math.min(previewSeconds, v.duration - 0.15)) v.currentTime = 0;
    }, 120);
    return () => clearInterval(t);
  }, [previewSeconds]);

  const unknownDuration = () => {
    const v = ref.current;
    return !!v && !Number.isFinite(v.duration);
  };

  return (
    <>
      <video
        key={url}
        ref={ref}
        src={url}
        poster={poster || undefined}
        muted={muted}
        autoPlay={autoPlay}
        controls={controls}
        playsInline
        loop={!!previewSeconds && unknownDuration()}
        preload={previewSeconds ? "auto" : "metadata"}
        aria-label={ariaLabel}
        className={className}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (resumeAt.current > 0 && Number.isFinite(v.duration)) {
            v.currentTime = Math.min(resumeAt.current, v.duration);
            resumeAt.current = 0;
          }
          // Old recordings have no duration: Chrome reports Infinity until the end — force it to compute.
          if (!Number.isFinite(v.duration)) {
            v.currentTime = 1e101;
            v.addEventListener(
              "timeupdate",
              () => {
                v.currentTime = 0;
              },
              { once: true },
            );
          }
        }}
        onLoadedData={() => {
          setBuffering(false);
          onReady?.();
        }}
        onCanPlay={() => setBuffering(false)}
        onPlaying={() => setBuffering(false)}
        onWaiting={() => setBuffering(true)}
        onStalled={() => setBuffering(true)}
        onError={() => void reload(false)}
      />
      {buffering && !failed && (
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <Loader2 className="size-7 animate-spin text-white drop-shadow" />
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 grid place-items-center bg-black/70 text-white text-center p-4">
          <div className="space-y-2">
            <div className="text-sm">The video didn't load.</div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                void reload(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs"
            >
              <RefreshCw className="size-3.5" /> Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
