import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Square, Video, X, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { currentPosition, pickRandomPrompt, uploadRecordedBlob } from "@/lib/live-feed";
import { submitLiveVideo, type LiveFeedTarget } from "@/lib/live-feed.functions";

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
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const submit = useServerFn(submitLiveVideo);

  const [phase, setPhase] = useState<"init" | "ready" | "recording" | "processing" | "done" | "error">("init");
  const [err, setErr] = useState<string | null>(null);
  const [prompt] = useState(() => pickRandomPrompt());
  const [showPrompt, setShowPrompt] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [result, setResult] = useState<{ status: string; distance_m: number | null } | null>(null);

  // Start camera on mount (live camera only — no file picker)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1080 }, height: { ideal: 1350 } },
          audio: true,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setPhase("ready");
      } catch (e) {
        setErr("Camera access denied. Please allow camera + microphone.");
        setPhase("error");
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const start = async () => {
    setErr(null);
    if (!streamRef.current) return;
    try {
      const pos = await currentPosition();
      setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch (e) {
      setErr("Location required. Enable GPS and allow location.");
      return;
    }

    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"]
      .find((m) => (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m))) || "video/webm";
    chunksRef.current = [];
    const rec = new MediaRecorder(streamRef.current, { mimeType: mime, videoBitsPerSecond: 2_500_000 });
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    recorderRef.current = rec;

    setElapsed(0);
    setPhase("recording");
    rec.start(500);

    const started = Date.now();
    const iv = setInterval(() => {
      const s = Math.floor((Date.now() - started) / 1000);
      setElapsed(s);
      if (s === PROMPT_SHOW_AT) setShowPrompt(true);
      if (s === PROMPT_SHOW_AT + 3) setShowPrompt(false);
      if (s >= MAX_SEC) { clearInterval(iv); stopRecording(); }
    }, 250);
    (rec as unknown as { _iv?: number })._iv = iv as unknown as number;
  };

  const stopRecording = () => {
    const rec = recorderRef.current;
    if (!rec) return;
    const iv = (rec as unknown as { _iv?: number })._iv;
    if (iv) clearInterval(iv);
    if (rec.state !== "inactive") rec.stop();
  };

  const finish = async () => {
    stopRecording();
    if (elapsed < MIN_SEC) { setErr(`Please record at least ${MIN_SEC} seconds.`); return; }
    setPhase("processing");
    try {
      // wait for last chunk
      await new Promise((r) => setTimeout(r, 400));
      const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || "video/webm" });
      if (blob.size < 10_000) throw new Error("Recording failed. Try again.");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sign in required.");
      if (!coords) throw new Error("Location missing.");
      const ext = (recorderRef.current?.mimeType || "video/webm").includes("mp4") ? "mp4" : "webm";
      const path = await uploadRecordedBlob(user.id, blob, ext);
      const res = await submit({ data: {
        target,
        storage_path: path,
        captured_lat: coords.lat,
        captured_lng: coords.lng,
        random_prompt: prompt,
        duration_seconds: elapsed,
        mime_type: blob.type,
      }});
      setResult({ status: res.status, distance_m: res.distance_m });
      setPhase("done");
      onSuccess?.(res);
    } catch (e) {
      setErr((e as Error).message);
      setPhase("ready");
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden border border-border shadow-elevated">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2 font-semibold text-sm"><Video className="size-4 text-primary" /> Record live verified video</div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>

        <div className="relative aspect-[4/5] bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />

          {/* Overlays */}
          {phase === "recording" && (
            <div className="absolute top-2 left-2 inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive text-destructive-foreground text-[11px] font-medium">
              <span className="size-2 rounded-full bg-white animate-pulse" /> REC {elapsed}s / {MAX_SEC}s
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
                <div className="text-[10px] uppercase tracking-widest opacity-70 mb-1">Do this now</div>
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
                <div className="text-sm">Uploading & verifying…</div>
              </div>
            </div>
          )}
          {phase === "done" && result && (
            <div className="absolute inset-0 grid place-items-center bg-black/70 text-white p-6">
              <div className="text-center space-y-2">
                <ShieldCheck className="size-10 mx-auto text-green-400" />
                <div className="font-semibold">
                  {result.status === "verified" ? "Verified ✓" : result.status === "flagged" ? "Flagged — admin will review" : "Pending review"}
                </div>
                {result.distance_m != null && (
                  <div className="text-xs opacity-80">Distance from property: {Math.round(result.distance_m)} m</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="p-4 space-y-3">
          <div className="text-[11px] text-muted-foreground">
            Camera-only recording. When prompt appears mid-recording, follow it on camera. Duration {MIN_SEC}–{MAX_SEC}s.
          </div>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex gap-2">
            {phase === "ready" && (
              <button onClick={start} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">
                <Camera className="size-4" /> Start recording
              </button>
            )}
            {phase === "recording" && (
              <button
                onClick={finish}
                disabled={elapsed < MIN_SEC}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50"
              >
                <Square className="size-4" /> Stop {elapsed < MIN_SEC ? `(wait ${MIN_SEC - elapsed}s)` : "& submit"}
              </button>
            )}
            {phase === "done" && (
              <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Done</button>
            )}
            {(phase === "processing" || phase === "init") && (
              <button disabled className="flex-1 px-4 py-2.5 rounded-xl bg-muted text-muted-foreground text-sm font-medium">Working…</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
