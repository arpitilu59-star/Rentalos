import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RefreshCw } from "lucide-react";

type Props = {
  src: string;
  getFreshUrl?: () => Promise<string | null>;
  poster?: string | null;
  controls?: boolean;
  muted?: boolean;
  autoPlay?: boolean;
  loop?: boolean;
  /** Controlled playback for viewport-aware card previews. */
  playing?: boolean;
  className?: string;
  ariaLabel?: string;
  onReady?: () => void;
  onFailed?: () => void;
};

/** Reloads the element even when a refreshed signed URL is identical. Never hides Retry. */
export function ResilientVideo({
  src,
  getFreshUrl,
  poster,
  controls,
  muted,
  autoPlay,
  loop,
  playing,
  className = "",
  ariaLabel,
  onReady,
  onFailed,
}: Props) {
  const ref = useRef<HTMLVideoElement>(null);
  const [url, setUrl] = useState(src);
  const [attempt, setAttempt] = useState(0);
  const [buffering, setBuffering] = useState(true);
  const [failed, setFailed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const triedFresh = useRef(false);
  const loading = useRef(false);
  const generation = useRef(0);
  const resumeAt = useRef(0);
  const wasPlaying = useRef(false);
  const callbacks = useRef({ getFreshUrl, onReady, onFailed });
  callbacks.current = { getFreshUrl, onReady, onFailed };

  useEffect(() => {
    generation.current++;
    loading.current = false;
    triedFresh.current = false;
    resumeAt.current = 0;
    wasPlaying.current = false;
    setUrl(src);
    setFailed(false);
    setBuffering(true);
    setBlocked(false);
    return () => {
      generation.current++;
    };
  }, [src]);

  const play = useCallback(() => {
    const v = ref.current;
    if (!v) return;
    void v
      .play()
      .then(() => setBlocked(false))
      .catch((e: DOMException) => {
        if (e.name === "NotAllowedError") {
          setBlocked(true);
          setBuffering(false);
        }
      });
  }, []);

  const reload = useCallback(
    async (manual: boolean) => {
      if (loading.current) return;
      const g = generation.current;
      const v = ref.current;
      if (v) {
        resumeAt.current = v.currentTime || 0;
        wasPlaying.current = !v.paused;
      }
      if (manual || (!triedFresh.current && callbacks.current.getFreshUrl)) {
        loading.current = true;
        triedFresh.current = true;
        setBuffering(true);
        setFailed(false);
        try {
          const fresh = callbacks.current.getFreshUrl ? await callbacks.current.getFreshUrl() : src;
          if (g !== generation.current) return;
          if (fresh) {
            setUrl(fresh);
            setAttempt((n) => n + 1);
            setBlocked(false);
            return;
          }
        } catch {
          /* Show the retry state below. */
        } finally {
          if (g === generation.current) loading.current = false;
        }
      }
      if (g !== generation.current) return;
      setFailed(true);
      setBuffering(false);
      callbacks.current.onFailed?.();
    },
    [src],
  );

  useEffect(() => {
    if (playing === false) ref.current?.pause();
    else if (playing || autoPlay || wasPlaying.current) play();
  }, [playing, autoPlay, url, attempt, play]);

  useEffect(() => {
    if (!buffering || failed) return;
    const timer = setTimeout(() => void reload(false), 20000);
    return () => clearTimeout(timer);
  }, [buffering, failed, attempt, reload]);

  return (
    <>
      <video
        key={`${url}:${attempt}`}
        ref={ref}
        src={url}
        poster={poster || undefined}
        muted={muted}
        controls={controls}
        playsInline
        loop={loop}
        preload={playing === undefined ? "metadata" : "auto"}
        aria-label={ariaLabel}
        className={className}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (resumeAt.current > 0 && Number.isFinite(v.duration)) {
            v.currentTime = Math.min(resumeAt.current, Math.max(0, v.duration - 0.1));
            resumeAt.current = 0;
          }
          // Unknown duration is allowed for legacy media; never seek to Infinity.
          if (playing === undefined && !autoPlay) setBuffering(false);
        }}
        onLoadedData={() => {
          setBuffering(false);
          callbacks.current.onReady?.();
        }}
        onCanPlay={() => {
          setBuffering(false);
          if (playing || autoPlay || wasPlaying.current) play();
        }}
        onPlaying={() => {
          setBuffering(false);
          setBlocked(false);
        }}
        onWaiting={() => setBuffering(true)}
        onStalled={() => {
          if (!ref.current?.paused) setBuffering(true);
        }}
        onError={() => void reload(false)}
      />
      {buffering && !failed && (
        <div
          className="absolute inset-0 grid place-items-center pointer-events-none"
          role="status"
          aria-label="Loading video"
        >
          <Loader2 className="size-7 animate-spin motion-reduce:animate-none text-white drop-shadow" />
        </div>
      )}
      {blocked && !controls && !failed && (
        <button
          type="button"
          aria-label="Play room preview"
          className="absolute inset-0 grid place-items-center bg-black/20 text-white"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            play();
          }}
        >
          <Play className="size-10" />
        </button>
      )}
      {failed && (
        <div
          className="absolute inset-0 grid place-items-center bg-black/70 text-white text-center p-4"
          role="status"
        >
          <div className="space-y-2">
            <div className="text-sm">The video could not load.</div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                void reload(true);
              }}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-md bg-white/15 hover:bg-white/25 px-3 py-2 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            >
              <RefreshCw className="size-3.5" /> Try again
            </button>
          </div>
        </div>
      )}
    </>
  );
}
