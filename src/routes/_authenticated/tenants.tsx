import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Room, type Tenant } from "@/lib/db";
import { Plus, Pencil, Trash2, X, Phone, Camera } from "lucide-react";

export const Route = createFileRoute("/_authenticated/tenants")({ component: TenantsPage });

type TenantWithRoom = Tenant & { rooms: { room_number: string } | null };

function TenantsPage() {
  const [tenants, setTenants] = useState<TenantWithRoom[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [editing, setEditing] = useState<TenantWithRoom | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [q, setQ] = useState("");

  const load = async () => {
    const [{ data: t }, { data: r }] = await Promise.all([
      supabase.from("tenants").select("*, rooms(room_number)").order("created_at", { ascending: false }),
      supabase.from("rooms").select("*").order("room_number"),
    ]);
    setTenants((t ?? []) as TenantWithRoom[]);
    setRooms((r ?? []) as Room[]);
  };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => { if (!confirm("Remove tenant?")) return; await supabase.from("tenants").delete().eq("id", id); load(); };
  const filtered = tenants.filter((t) => !q || (t.name + t.phone + (t.rooms?.room_number ?? "")).toLowerCase().includes(q.toLowerCase()));

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground mt-1">Track who lives where.</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(true); }} disabled={rooms.length === 0} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">
          <Plus className="size-4" /> Add tenant
        </button>
      </div>

      {rooms.length === 0 && <div className="rounded-2xl border border-dashed border-border p-6 text-center text-muted-foreground mb-4">Add a room first.</div>}

      <div className="mb-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full px-3 py-2 rounded-lg bg-card border border-input outline-none focus:ring-2 ring-ring/40" /></div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {filtered.map((t) => (
          <div key={t.id} className="rounded-2xl bg-card border border-border p-4 shadow-card">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-xs text-muted-foreground">Room {t.rooms?.room_number}</div>
                <div className="text-lg font-semibold">{t.name}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${t.active ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{t.active ? "Active" : "Inactive"}</span>
            </div>
            <a href={`tel:${t.phone}`} className="mt-2 flex items-center gap-1 text-sm text-muted-foreground hover:text-primary"><Phone className="size-3" /> {t.phone}</a>
            <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
              <div>Persons: <span className="font-medium text-foreground">{t.persons}</span></div>
              <div>Move-in: {new Date(t.move_in_date).toLocaleDateString("en-IN")}</div>
              {t.rent_share != null && <div>Rent share: ₹{t.rent_share}</div>}
            </div>
            <div className="flex gap-2 mt-3">
              <button onClick={() => { setEditing(t); setShowForm(true); }} className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent"><Pencil className="size-3" /> Edit</button>
              <button onClick={() => del(t.id)} className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>
            </div>
          </div>
        ))}
      </div>

      {showForm && <TenantForm rooms={rooms} initial={editing ?? undefined} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
    </AppShell>
  );
}

function TenantForm({ initial, rooms, onClose, onSaved }: { initial?: TenantWithRoom; rooms: Room[]; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [room_id, setRoom] = useState(initial?.room_id ?? rooms[0]?.id ?? "");
  const [persons, setPersons] = useState(initial?.persons?.toString() ?? "1");
  const [move_in_date, setMove] = useState(initial?.move_in_date ?? new Date().toISOString().slice(0, 10));
  const [rent_share, setRentShare] = useState(initial?.rent_share?.toString() ?? "");
  const [active, setActive] = useState(initial?.active ?? true);
  const [initial_reading, setInitialReading] = useState(initial?.initial_reading?.toString() ?? "");
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);

  const onPickPhoto = (f: File) => { setPhotoFile(f); setPhotoPreview(URL.createObjectURL(f)); };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const owner_id = await getOwnerId();
    let photoPath: string | null = initial?.initial_reading_photo ?? null;
    if (photoFile) {
      const ext = photoFile.name.split(".").pop() || "jpg";
      const path = `${owner_id}/${room_id}/initial-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("meter-photos").upload(path, photoFile, { upsert: false });
      if (!error) photoPath = path;
    }
    const initReadingNum = initial_reading === "" ? null : Number(initial_reading);
    const payload = {
      name: name.trim(), phone: phone.trim(), email: email.trim() || null,
      room_id, persons: Number(persons) || 1, move_in_date,
      rent_share: rent_share === "" ? null : Number(rent_share), active,
      initial_reading: initReadingNum,
      initial_reading_date: initReadingNum != null ? move_in_date : null,
      initial_reading_photo: photoPath,
    };
    if (initial) {
      await supabase.from("tenants").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("tenants").insert({ ...payload, owner_id });
    }
    // Seed a meter_readings entry for the move-in reading so bills compute from it
    if (!initial && initReadingNum != null) {
      await supabase.from("meter_readings").insert({
        owner_id, room_id, reading: initReadingNum, reading_date: move_in_date,
        photo_path: photoPath, ai_detected: false,
      });
    }
    setSaving(false); onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">{initial ? "Edit tenant" : "Add tenant"}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[80vh] overflow-y-auto">
          <Field label="Name"><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
          <Field label="Phone (WhatsApp)"><input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={input} /></Field>
          <Field label="Email (for receipts)"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="tenant@example.com" className={input} /></Field>
          <Field label="Room">
            <select required value={room_id} onChange={(e) => setRoom(e.target.value)} className={input}>
              {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Persons"><input required type="number" min="1" value={persons} onChange={(e) => setPersons(e.target.value)} className={input} /></Field>
            <Field label="Move-in date"><input required type="date" value={move_in_date} onChange={(e) => setMove(e.target.value)} className={input} /></Field>
          </div>
          <Field label="Rent share (optional)"><input type="number" min="0" value={rent_share} onChange={(e) => setRentShare(e.target.value)} className={input} /></Field>

          <div className="rounded-xl bg-muted/40 p-3 space-y-2 border border-dashed border-border">
            <div className="text-xs font-medium text-muted-foreground">Move-in meter reading (optional)</div>
            <p className="text-[11px] text-muted-foreground">Yahan meter ki current reading daalo jo move-in ke time thi. Future bills isse calculate honge (0 se nahi).</p>
            <input type="number" min="0" step="0.01" value={initial_reading} onChange={(e) => setInitialReading(e.target.value)} placeholder="e.g. 12450" className={input} />
            <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={(e) => e.target.files?.[0] && onPickPhoto(e.target.files[0])} className="hidden" />
            <button type="button" onClick={() => photoRef.current?.click()} className="w-full inline-flex items-center justify-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs hover:bg-accent">
              <Camera className="size-3" /> {photoFile ? photoFile.name : "Upload meter photo"}
            </button>
            {photoPreview && <img src={photoPreview} alt="meter" className="w-full max-h-32 object-cover rounded-lg" />}
          </div>

          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active tenant</label>
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
