import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Square, Video, X, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  currentPosition,
  pickRandomPrompt,
  pickRecorderMime,
  uploadRecordedBlob,
} from "@/lib/live-feed";
import { fixWebmBlobDuration } from "@/lib/webm-fix";
import { submitLiveVideo, type LiveFeedTarget } from "@/lib/live-feed.functions";
import { recordStream } from "@/lib/recording-session";
import { friendlyVideoError } from "@/lib/video";

const MIN_SEC = 15;
const MAX_SEC = 30;
const PROMPT_SHOW_AT = 5; // seconds

type Props = {
  target: LiveFeedTarget;
  onClose: () => void;
  onSuccess?: (info: { id: string; status: string; distance_m: number | null }) => void;
};

export function LiveFeedRecorder({ target, onClose, onSuccess }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const sessionRef = useRef<ReturnType<typeof recordStream> | null>(null);
  const locked = useRef(false);
  const submitting = useRef(false);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const coordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const submit = useServerFn(submitLiveVideo);
  const [phase, setPhase] = useState<
    "init" | "ready" | "starting" | "recording" | "processing" | "done" | "error"
  >("init");
  const [err, setErr] = useState<string | null>(null);
  const [prompt] = useState(() => pickRandomPrompt());
  const [showPrompt, setShowPrompt] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<{ status: string; distance_m: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1080 },
            height: { ideal: 1350 },
          },
          audio: true,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play().catch(() => {});
        }
        setPhase("ready");
      } catch {
        if (!cancelled) {
          setErr("Camera access denied. Please allow camera + microphone.");
          setPhase("error");
        }
      }
    })();
    return () => {
      cancelled = true;
      mounted.current = false;
      if (timer.current) clearInterval(timer.current);
      sessionRef.current?.cancel();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const finish = async () => {
    const session = sessionRef.current;
    if (!session || submitting.current) return;
    if (session.elapsed() < MIN_SEC) {
      setErr(`Please record at least ${MIN_SEC} seconds.`);
      return;
    }
    submitting.current = true;
    if (timer.current) clearInterval(timer.current);
    setShowPrompt(false);
    setPhase("processing");
    try {
      const { blob: original, durationMs } = await session.stop();
      if (!mounted.current) return;
      if (original.size < 10000) throw new Error("Recording failed. Try again.");
      const blob = await fixWebmBlobDuration(original, durationMs);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required.");
      const position = coordsRef.current;
      if (!position) throw new Error("Location missing.");
      if (!mounted.current) return;
      const path = await uploadRecordedBlob(
        user.id,
        blob,
        blob.type.includes("mp4") ? "mp4" : "webm",
      );
      const res = await submit({
        data: {
          target,
          storage_path: path,
          captured_lat: position.lat,
          captured_lng: position.lng,
          random_prompt: prompt,
          duration_seconds: Math.min(MAX_SEC, Math.round(durationMs / 1000)),
          mime_type: blob.type,
        },
      });
      window.dispatchEvent(new Event("room-video-updated"));
      if (!mounted.current) return;
      setResult({ status: res.status, distance_m: res.distance_m });
      setPhase("done");
      onSuccess?.(res);
    } catch (e) {
      if (mounted.current) {
        setErr(friendlyVideoError(e));
        setPhase("ready");
      }
    } finally {
      submitting.current = false;
      locked.current = false;
      sessionRef.current = null;
    }
  };

  const start = async () => {
    // Lock before the first await: rapid taps during GPS lookup must never create two recorders.
    if (locked.current || !streamRef.current) return;
    locked.current = true;
    setPhase("starting");
    setErr(null);
    setShowPrompt(false);
    try {
      const pos = await currentPosition();
      if (!mounted.current || !streamRef.current) return;
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      coordsRef.current = position;
      setCoords(position);
      const session = recordStream(streamRef.current, pickRecorderMime());
      sessionRef.current = session;
      setElapsed(0);
      setPhase("recording");
      timer.current = setInterval(() => {
        const seconds = Math.floor(session.elapsed());
        setElapsed(Math.min(seconds, MAX_SEC));
        setShowPrompt(seconds >= PROMPT_SHOW_AT && seconds < PROMPT_SHOW_AT + 3);
        if (seconds >= MAX_SEC) void finish();
      }, 250);
    } catch {
      locked.current = false;
      if (mounted.current) {
        setErr("Could not start recording. Allow camera, microphone and location, then try again.");
        setPhase("ready");
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden border border-border shadow-elevated">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm">
            <Video className="size-4 text-primary" /> Record live verified video
          </div>
          <button
            onClick={onClose}
            disabled={phase === "processing"}
            aria-label="Close recording"
            className="p-1 rounded-md hover:bg-accent disabled:opacity-50"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="relative aspect-[4/5] bg-black">
          <video
            ref={videoRef}
            playsInline
            muted
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Overlays */}
          {phase === "recording" && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-medium">
              <span className="size-2 rounded-full bg-white animate-pulse" /> REC {elapsed}s /{" "}
              {MAX_SEC}s
            </div>
          )}
          {coords && phase !== "init" && (
            <div className="absolute top-2 right-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-black/50 text-white text-[10px]">
              <MapPin className="size-3" /> GPS
            </div>
          )}
          {showPrompt && (
            <div className="absolute inset-0 grid place-items-center pointer-events-none">
              <div className="px-5 py-4 rounded-2xl bg-black/70 text-white text-center max-w-[80%] animate-in fade-in zoom-in">
                <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">
                  Do this now
                </div>
                <div className="text-lg font-semibold">{prompt}</div>
              </div>
            </div>
          )}
          {phase === "init" && (
            <div className="absolute inset-0 grid place-items-center text-white/80">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}
          {phase === "processing" && (
            <div className="absolute inset-0 grid place-items-center bg-black/60 text-white">
              <div className="text-center space-y-2">
                <Loader2 className="size-8 animate-spin mx-auto" />
                <div className="text-sm">Saving your video — keep this screen open…</div>
              </div>
            </div>
          )}
          {phase === "done" && result && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-white p-6">
              <div className="text-center space-y-2">
                <ShieldCheck className="size-10 mx-auto text-green-400" />
                <div className="font-semibold">
                  {result.status === "verified"
                    ? "Verified ✓"
                    : result.status === "flagged"
                      ? "Flagged — admin will review"
                      : "Pending review"}
                </div>
                {result.distance_m != null && (
                  <div className="text-xs opacity-80">
                    Distance from property: {Math.round(result.distance_m)} m
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[11px] text-muted-foreground">
            Camera-only recording. When prompt appears mid-recording, follow it on camera. Duration{" "}
            {MIN_SEC}–{MAX_SEC}s.
          </div>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex gap-2">
            {phase === "ready" && (
              <button
                onClick={start}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                <Camera className="size-4" /> Start recording
              </button>
            )}
            {phase === "recording" && (
              <button
                onClick={finish}
                disabled={elapsed < MIN_SEC}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
              >
                <Square className="size-4" /> Stop{" "}
                {elapsed < MIN_SEC ? `(wait ${MIN_SEC - elapsed}s)` : "& submit"}
              </button>
            )}
            {phase === "done" && (
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                Done
              </button>
            )}
            {(phase === "processing" || phase === "init" || phase === "starting") && (
              <button
                disabled
                className="flex-1 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium"
              >
                Working…
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
