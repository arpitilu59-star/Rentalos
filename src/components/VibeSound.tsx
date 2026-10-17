import { useEffect, useRef, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { Volume2, VolumeX } from "lucide-react";
import { VIBE_MUTE_KEY, VIBE_PLAYED_KEY, playVibe } from "@/lib/vibe-sound";

const read = (k: string, s: "local" | "session"): string | null => {
  try {
    return (s === "local" ? localStorage : sessionStorage).getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string, s: "local" | "session") => {
  try {
    (s === "local" ? localStorage : sessionStorage).setItem(k, v);
  } catch {
    /* storage unavailable */
  }
};

/** Pages where a welcome tone makes sense: public marketing/browse pages, not dashboards or admin. */
const PUBLIC = (p: string) => p === "/" || p.startsWith("/rooms-in") || p === "/about" || p === "/pricing" || p.startsWith("/myr/browse");

/**
 * Plays a short welcome tone once per visit. Browsers block sound until the visitor interacts,
 * so it starts on the first tap/click/key/scroll. A small button lets people mute it for good.
 */
export function VibeSound() {
  const { pathname } = useLocation();
  const [muted, setMuted] = useState(true); // true until we've read storage (avoids SSR/hydration flash)
  const [ready, setReady] = useState(false);
  const stopRef = useRef<(() => void) | null>(null);
  const mutedRef = useRef(true);

  useEffect(() => {
    const m = read(VIBE_MUTE_KEY, "local") === "1";
    mutedRef.current = m;
    setMuted(m);
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !PUBLIC(pathname) || read(VIBE_PLAYED_KEY, "session") === "1") return;
    // Only real "activation" gestures unlock audio (scroll/touchstart do not), so listen for these.
    const events = ["click", "pointerup", "keydown", "touchend"] as const;
    let busy = false;
    const start = async () => {
      if (busy || mutedRef.current || read(VIBE_PLAYED_KEY, "session") === "1") return;
      busy = true;
      try {
        const stop = await playVibe();
        if (stop) {
          // Only now is it really playing: stop listening and remember it for this visit.
          write(VIBE_PLAYED_KEY, "1", "session");
          stopRef.current = stop;
          events.forEach((e) => window.removeEventListener(e, start));
        }
      } catch {
        /* audio not available */
      } finally {
        busy = false;
      }
    };
    events.forEach((e) => window.addEventListener(e, start, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, start));
  }, [ready, pathname]);

  useEffect(() => () => stopRef.current?.(), []);

  if (!ready || !PUBLIC(pathname)) return null;

  const toggle = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    write(VIBE_MUTE_KEY, next ? "1" : "0", "local");
    if (next) {
      stopRef.current?.();
      stopRef.current = null;
    } else {
      // Turning sound on is itself a tap, so audio is allowed: play the tone now.
      void playVibe()
        .then((stop) => {
          if (stop) {
            write(VIBE_PLAYED_KEY, "1", "session");
            stopRef.current = stop;
          }
        })
        .catch(() => {});
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={!muted}
      aria-label={muted ? "Turn welcome sound on" : "Mute welcome sound"}
      title={muted ? "Sound off — tap to turn on" : "Sound on — tap to mute"}
      className="fixed bottom-4 left-4 z-40 size-10 rounded-full border border-border bg-card/90 backdrop-blur shadow-lg grid place-items-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 ring-ring/60"
    >
      {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
    </button>
  );
}
