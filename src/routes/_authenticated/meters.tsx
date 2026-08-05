import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, getOwnerId, type MeterReading, type Room } from "@/lib/db";
import { detectMeterReading } from "@/lib/meter-ocr.functions";
import { Camera, Sparkles, Trash2, X, Zap, LineChart } from "lucide-react";

export const Route = createFileRoute("/_authenticated/meters")({ component: MetersPage });

function MetersPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    const [{ data: r }, { data: m }] = await Promise.all([
      supabase.from("rooms").select("*").order("room_number"),
      supabase.from("meter_readings").select("*").order("reading_date", { ascending: false }),
    ]);
    setRooms((r ?? []) as Room[]); setReadings((m ?? []) as MeterReading[]);
  };
  useEffect(() => { load(); }, []);

  // Bucket is private — generate short-lived signed URLs (5 min)
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    const paths = readings.map((r) => r.photo_path).filter((p): p is string => !!p && !signedUrls[p]);
    if (paths.length === 0) return;
    supabase.storage.from("meter-photos").createSignedUrls(paths, 300).then(({ data }) => {
      if (!data) return;
      const next: Record<string, string> = {};
      data.forEach((d) => { if (d.path && d.signedUrl) next[d.path] = d.signedUrl; });
      setSignedUrls((prev) => ({ ...prev, ...next }));
    });
  }, [readings]);
  const photoUrl = (path: string | null) => path ? (signedUrls[path] ?? null) : null;

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Meter Readings</h1>
          <p className="text-muted-foreground mt-1">Snap a meter photo — AI reads the number for you.</p>
        </div>
        <button onClick={() => setShowForm(true)} disabled={rooms.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">
          <Camera className="size-4" /> New reading
        </button>
      </div>

      {rooms.map((room) => {
        const list = readings.filter((r) => r.room_id === room.id);
        const latest = list[0]; const prev = list[1];
        const units = latest && prev ? Number(latest.reading) - Number(prev.reading) : null;
        return (
          <div key={room.id} className="rounded-2xl bg-card border border-border p-4 shadow-card mb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-lg bg-warning/20 text-warning-foreground grid place-items-center"><Zap className="size-5" /></div>
                <div>
                  <div className="font-semibold">Room {room.room_number}</div>
                  <div className="text-xs text-muted-foreground">{latest ? `Latest: ${latest.reading} units · ${formatDate(latest.reading_date)}` : "No readings yet"}</div>
                </div>
              </div>
              {units !== null && <div className="text-right"><div className="text-xs text-muted-foreground">Since last</div><div className="font-semibold text-primary">{units} units</div></div>}
            </div>
            <div className="mt-2">
              <Link to="/rooms/$roomId/analysis" params={{ roomId: room.id }} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                <LineChart className="size-3" /> View monthly analysis & faulty meter check
              </Link>
            </div>
            {list.length > 0 && (
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {list.slice(0, 4).map((r) => (
                  <div key={r.id} className="rounded-lg bg-muted/50 p-2 text-xs flex items-center justify-between">
                    <div>
                      <div className="font-medium text-foreground">{Number(r.reading).toLocaleString()}</div>
                      <div className="text-muted-foreground">{formatDate(r.reading_date)}{r.ai_detected && " · AI"}</div>
                    </div>
                    {r.photo_path && photoUrl(r.photo_path) && (
                      <a href={photoUrl(r.photo_path)!} target="_blank" rel="noreferrer" className="size-10 rounded overflow-hidden border border-border">
                        <img src={photoUrl(r.photo_path)!} alt="meter" className="w-full h-full object-cover" />
                      </a>
                    )}
                    <button onClick={async () => { if (!confirm("Delete reading?")) return; await supabase.from("meter_readings").delete().eq("id", r.id); load(); }} className="ml-1 text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {rooms.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">Add a room first.</div>}

      {showForm && <ReadingForm rooms={rooms} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </AppShell>
  );
}

function ReadingForm({ rooms, onClose, onSaved }: { rooms: Room[]; onClose: () => void; onSaved: () => void }) {
  const [room_id, setRoom] = useState(rooms[0]?.id ?? "");
  const [reading, setReading] = useState("");
  const [reading_date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [aiDetected, setAiDetected] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const detectFn = useServerFn(detectMeterReading);

  const handleFile = async (f: File) => { setFile(f); setPreview(URL.createObjectURL(f)); };

  const runAI = async () => {
    if (!file) return;
    setDetecting(true);
    try {
      const buf = await file.arrayBuffer();
      let bin = ""; const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const b64 = btoa(bin);
      const res = await detectFn({ data: { imageBase64: b64, mimeType: file.type || "image/jpeg" } });
      if (res?.reading) { setReading(String(res.reading)); setAiDetected(true); }
    } catch (e) { console.error(e); alert("AI detection failed."); }
    finally { setDetecting(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const owner_id = await getOwnerId();
    let photo_path: string | null = null;
    if (file) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${owner_id}/${room_id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("meter-photos").upload(path, file, { upsert: false });
      if (!error) photo_path = path;
    }
    await supabase.from("meter_readings").insert({ owner_id, room_id, reading: Number(reading) || 0, reading_date, photo_path, ai_detected: aiDetected });
    setSaving(false); onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">New meter reading</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
          <Field label="Room">
            <select required value={room_id} onChange={(e) => setRoom(e.target.value)} className={input}>
              {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </Field>
          <Field label="Meter photo (optional, for AI)">
            <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} className="hidden" />
            <button type="button" onClick={() => fileRef.current?.click()} className="w-full rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground hover:bg-accent/50">
              {file ? file.name : "Tap to upload / take photo"}
            </button>
            {preview && (
              <div className="mt-2 relative rounded-lg overflow-hidden border border-border">
                <img src={preview} alt="meter preview" className="w-full max-h-48 object-cover" />
                <button type="button" onClick={runAI} disabled={detecting} className="absolute bottom-2 right-2 inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-elevated disabled:opacity-60">
                  <Sparkles className="size-3" /> {detecting ? "Reading…" : "Detect with AI"}
                </button>
              </div>
            )}
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Reading"><input required type="number" min="0" step="0.01" value={reading} onChange={(e) => { setReading(e.target.value); setAiDetected(false); }} className={input} /></Field>
            <Field label="Date"><input required type="date" value={reading_date} onChange={(e) => setDate(e.target.value)} className={input} /></Field>
          </div>
          {aiDetected && <p className="text-xs text-success">✓ Reading detected by AI. Verify before saving.</p>}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save reading"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
