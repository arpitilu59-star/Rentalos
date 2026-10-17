import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Loader2, Trash2, X, ShieldCheck, Clock, AlertTriangle, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { currentPosition, uploadLivePhoto } from "@/lib/live-feed";
import { deleteLivePhoto, listMyLivePhotos, submitLivePhoto } from "@/lib/live-photos.functions";

type Target = { kind: "room" | "property"; id: string };
type Row = { id: string; url: string; verification_status: string; distance_m: number | null };

const MAX_EDGE = 1600;

function canvasToJpeg(video: HTMLVideoElement): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * scale);
  c.height = Math.round(h * scale);
  c.getContext("2d")!.drawImage(video, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("capture"))), "image/jpeg", 0.85));
}

function Camera_({ target, onClose, onSaved }: { target: Target; onClose: () => void; onSaved: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const submit = useServerFn(submitLivePhoto);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(0);

  useEffect(() => {
    let off = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } },
          audio: false,
        });
        if (off) return s.getTracks().forEach((t) => t.stop());
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        setReady(true);
      } catch {
        setErr("Camera access denied. Please allow the camera.");
      }
    })();
    return () => {
      off = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const snap = async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    setBusy(true);
    setErr(null);
    try {
      const pos = await currentPosition().catch(() => {
        throw new Error("Location required. Turn on GPS and allow location.");
      });
      const blob = await canvasToJpeg(v);
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const path = await uploadLivePhoto(u.user.id, blob);
      await submit({
        data: { target, storage_path: path, captured_lat: pos.coords.latitude, captured_lng: pos.coords.longitude },
      });
      setSaved((n) => n + 1);
      onSaved();
      toast.success("Photo saved.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't save the photo. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/90 grid place-items-center p-4">
      <div className="bg-card rounded-2xl w-full max-w-md overflow-hidden border border-border">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="font-semibold text-sm inline-flex items-center gap-2">
            <Camera className="size-4 text-primary" /> Live photos {saved > 0 && `· ${saved} added`}
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent" aria-label="Close">
            <X className="size-4" />
          </button>
        </div>
        <div className="relative aspect-[4/3] bg-black">
          <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
          {!ready && !err && (
            <div className="absolute inset-0 grid place-items-center text-white/80">
              <Loader2 className="size-8 animate-spin" />
            </div>
          )}
        </div>
        <div className="p-4 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Take photos inside the property with this camera (no gallery uploads). Each photo records your GPS location;
            photos within 50 m of the listed address are marked "Live verified" automatically.
          </p>
          {err && <div className="text-xs text-destructive">{err}</div>}
          <div className="flex gap-2">
            <button
              onClick={snap}
              disabled={!ready || busy}
              className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}{" "}
              {busy ? "Saving…" : "Take photo"}
            </button>
            <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-border text-sm">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  verified: { label: "Live verified", cls: "bg-emerald-600", icon: ShieldCheck },
  pending: { label: "In review", cls: "bg-amber-500", icon: Clock },
  flagged: { label: "Away from property", cls: "bg-destructive", icon: AlertTriangle },
  rejected: { label: "Rejected", cls: "bg-destructive", icon: AlertTriangle },
};

export function LivePhotosManager({ target, label = "Live photos" }: { target: Target; label?: string }) {
  const list = useServerFn(listMyLivePhotos);
  const del = useServerFn(deleteLivePhoto);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = async () => {
    try {
      setRows((await list({ data: { target } })) as Row[]);
    } catch {
      setRows([]);
    }
  };
  useEffect(() => {
    void load(); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.kind, target.id]);

  const remove = async (id: string) => {
    if (!confirm("Delete this photo?")) return;
    setBusy(id);
    try {
      await del({ data: { id } });
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't delete.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-border p-3 space-y-2 bg-card">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium inline-flex items-center gap-1.5">
          <ImagePlus className="size-4 text-primary" /> {label}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-primary text-primary-foreground"
        >
          <Camera className="size-3" /> Take photos
        </button>
      </div>
      {rows === null ? (
        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Loader2 className="size-3 animate-spin" /> Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-xs text-muted-foreground">
          No live photos yet. Tenants trust listings with real, on-the-spot photos — add 4–6.
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {rows.map((r) => {
            const s = STATUS[r.verification_status] ?? STATUS.pending;
            const Icon = s.icon;
            return (
              <div key={r.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
                <img src={r.url} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                <span className={`absolute left-1 top-1 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] text-white ${s.cls}`}>
                  <Icon className="size-2.5" /> {s.label}
                </span>
                <button
                  onClick={() => remove(r.id)}
                  disabled={busy === r.id}
                  aria-label="Delete photo"
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white disabled:opacity-50"
                >
                  {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : <Trash2 className="size-3" />}
                </button>
              </div>
            );
          })}
        </div>
      )}
      {open && <Camera_ target={target} onClose={() => setOpen(false)} onSaved={() => void load()} />}
    </div>
  );
}
