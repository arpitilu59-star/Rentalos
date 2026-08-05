import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Property } from "@/lib/db";
import { getCurrentAddress } from "@/lib/geolocate";
import { publishProperty } from "@/lib/bookings.functions";
import { Plus, Pencil, Trash2, X, Building2, MapPin, Globe2, Loader2, EyeOff, Video } from "lucide-react";
import { LiveFeedManager } from "@/components/LiveFeedManager";

export const Route = createFileRoute("/_authenticated/properties")({ component: PropertiesPage });

type PropertyWithMyr = Property & { is_public_listing?: boolean; verification_status?: string; has_verified_video?: boolean };

function PropertiesPage() {
  const [items, setItems] = useState<PropertyWithMyr[]>([]);
  const [editing, setEditing] = useState<PropertyWithMyr | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [liveFor, setLiveFor] = useState<PropertyWithMyr | null>(null);
  const publish = useServerFn(publishProperty);

  const load = async () => {
    const { data } = await supabase.from("properties").select("*").order("created_at");
    setItems((data ?? []) as PropertyWithMyr[]);
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Property delete karein? Iske saare rooms, tenants, bills bhi delete ho jayenge.")) return;
    await supabase.from("properties").delete().eq("id", id);
    load();
  };

  const togglePublish = async (p: PropertyWithMyr) => {
    setBusy(p.id);
    try {
      await publish({ data: { property_id: p.id, publish: !p.is_public_listing } });
      await load();
    } catch (e) {
      alert("Failed: " + (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Properties</h1>
          <p className="text-muted-foreground mt-1">Apke saare PGs / buildings ek jagah.</p>
        </div>
        <button onClick={() => { setEditing(null); setShow(true); }} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium">
          <Plus className="size-4" /> Add property
        </button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((p) => (
          <div key={p.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-lg bg-primary/15 text-primary grid place-items-center"><Building2 className="size-5" /></div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.city || "—"}</div>
              </div>
            </div>
            {p.address && <div className="mt-2 text-xs text-muted-foreground">{p.address}</div>}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button onClick={() => { setEditing(p); setShow(true); }} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent">
                <Pencil className="size-3" /> Edit
              </button>
              <button onClick={() => setLiveFor(p)} className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent" title="Add / manage live verified video">
                <Video className="size-3" /> Live feed{p.has_verified_video ? " ✓" : ""}
              </button>
              <button onClick={() => togglePublish(p)} disabled={busy === p.id} className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-60 ${p.is_public_listing ? "border border-border hover:bg-accent" : "bg-primary text-primary-foreground"}`}>
                {busy === p.id ? <Loader2 className="size-3 animate-spin" /> : p.is_public_listing ? <EyeOff className="size-3" /> : <Globe2 className="size-3" />}
                {p.is_public_listing ? "Unpublish MYR" : "Publish to MYR"}
              </button>
              <button onClick={() => del(p.id)} className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive">
                <Trash2 className="size-3" />
              </button>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
            No properties. Add your first one.
          </div>
        )}
      </div>

      {show && <PropertyForm initial={editing ?? undefined} onClose={() => setShow(false)} onSaved={() => { setShow(false); load(); }} />}
      {liveFor && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={() => setLiveFor(null)}>
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-4 space-y-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><div className="font-semibold text-sm">{liveFor.name} — Live feed</div><button onClick={() => setLiveFor(null)} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button></div>
            <LiveFeedManager target={{ kind: "property", id: liveFor.id }} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function PropertyForm({ initial, onClose, onSaved }: { initial?: Property; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [city, setCity] = useState(initial?.city ?? "");
  const [address, setAddress] = useState(initial?.address ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [latitude, setLat] = useState<number | null>(initial?.latitude ?? null);
  const [longitude, setLng] = useState<number | null>(initial?.longitude ?? null);
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const r = await getCurrentAddress();
      setAddress(r.address); setLat(r.lat); setLng(r.lng);
      const parts = r.address.split(",").map((s) => s.trim());
      if (parts.length >= 4 && !city) setCity(parts[parts.length - 4]);
    } catch (e) { alert("Location nahi mili: " + (e as Error).message); }
    finally { setLocating(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = { name: name.trim(), city: city || null, address: address || null, notes: notes || null, latitude, longitude };
    if (initial) await supabase.from("properties").update(payload).eq("id", initial.id);
    else {
      const owner_id = await getOwnerId();
      await supabase.from("properties").insert({ ...payload, owner_id });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">{initial ? "Edit property" : "Add property"}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <Field label="Property name *"><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
          <Field label="City"><input value={city ?? ""} onChange={(e) => setCity(e.target.value)} className={input} /></Field>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Address</span>
              <button type="button" onClick={useMyLocation} disabled={locating} className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60">
                <MapPin className="size-3" /> {locating ? "Locating…" : "Use current location"}
              </button>
            </div>
            <textarea value={address ?? ""} onChange={(e) => setAddress(e.target.value)} rows={2} className={input} />
            {latitude != null && longitude != null && (
              <a href={`https://www.google.com/maps?q=${latitude},${longitude}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
                <MapPin className="size-3" /> View on map ({latitude.toFixed(4)}, {longitude.toFixed(4)})
              </a>
            )}
          </div>
          <Field label="Notes"><input value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} className={input} /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
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
