import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, getOwnerId, type Property, type Room, type Tenant } from "@/lib/db";
import { publishRoom } from "@/lib/bookings.functions";
import { Plus, Pencil, Trash2, X, Globe2, EyeOff, Loader2, Video } from "lucide-react";
import { LiveFeedManager } from "@/components/LiveFeedManager";

type RoomWithMyr = Room & {
  is_public?: boolean;
  myr_available?: boolean;
  has_verified_video?: boolean;
};

export const Route = createFileRoute("/_authenticated/rooms")({ component: RoomsPage });

function RoomsPage() {
  const nav = useNavigate();
  const [rooms, setRooms] = useState<RoomWithMyr[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [editing, setEditing] = useState<RoomWithMyr | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filterProp, setFilterProp] = useState<string>("all");
  const [busyRoom, setBusyRoom] = useState<string | null>(null);
  const [liveFor, setLiveFor] = useState<RoomWithMyr | null>(null);
  const doPublishRoom = useServerFn(publishRoom);

  const load = async () => {
    const [{ data: r }, { data: t }, { data: p }] = await Promise.all([
      supabase.from("rooms").select("*").order("room_number"),
      supabase.from("tenants").select("*").eq("active", true),
      supabase.from("properties").select("*").order("name"),
    ]);
    setRooms((r ?? []) as RoomWithMyr[]);
    setTenants((t ?? []) as Tenant[]);
    setProperties((p ?? []) as Property[]);
  };
  useEffect(() => {
    load();
  }, []);

  const tenantsByRoom = (id: string) => tenants.filter((t) => t.room_id === id);
  const propName = (id: string) => properties.find((p) => p.id === id)?.name ?? "—";

  const togglePublish = async (r: RoomWithMyr) => {
    setBusyRoom(r.id);
    try {
      await doPublishRoom({ data: { room_id: r.id, publish: !r.is_public } });
      await load();
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "KYC_REQUIRED") {
        alert(
          "Publish karne se pehle apni landlord identity verify karni hogi. ID + selfie submit karein — admin review ke baad publish ho sakega.",
        );
        nav({ to: "/myr/landlord/verify" });
      } else {
        alert(msg);
      }
    }
    setBusyRoom(null);
  };
  const handleDelete = async (id: string) => {
    if (!confirm("Delete this room? Tenants & bills will be removed too.")) return;
    await supabase.from("rooms").delete().eq("id", id);
    load();
  };

  const filtered = filterProp === "all" ? rooms : rooms.filter((r) => r.property_id === filterProp);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Rooms</h1>
          <p className="text-muted-foreground mt-1">Add and manage rooms with their rent.</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
          disabled={properties.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50"
        >
          <Plus className="size-4" /> Add room
        </button>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
          Pehle ek{" "}
          <Link to="/properties" className="text-primary font-medium">
            property add karein
          </Link>
          .
        </div>
      ) : (
        <>
          <div className="mb-4">
            <select
              value={filterProp}
              onChange={(e) => setFilterProp(e.target.value)}
              className="px-3 py-2 rounded-lg bg-card border border-input text-sm"
            >
              <option value="all">All properties</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((r) => {
              const occ = tenantsByRoom(r.id);
              return (
                <div
                  key={r.id}
                  className="rounded-2xl bg-card border border-border p-4 shadow-card"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">{propName(r.property_id)}</div>
                      <div className="text-2xl font-semibold">Room {r.room_number}</div>
                    </div>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${occ.length ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                    >
                      {occ.length ? `${occ.length} tenant${occ.length > 1 ? "s" : ""}` : "Empty"}
                    </span>
                  </div>
                  <div className="mt-3 text-sm space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Rent</span>
                      <span className="font-medium">{formatINR(Number(r.rent_amount))}</span>
                    </div>
                    {r.water_per_person != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Water/person</span>
                        <span className="font-medium">{formatINR(Number(r.water_per_person))}</span>
                      </div>
                    )}
                    {r.cleaning_amount != null && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Cleaning</span>
                        <span className="font-medium">{formatINR(Number(r.cleaning_amount))}</span>
                      </div>
                    )}
                    {occ.length > 0 && (
                      <div className="mt-2 text-xs text-muted-foreground">
                        {occ.map((t) => t.name).join(", ")}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 mt-4 flex-wrap">
                    <button
                      onClick={() => {
                        setEditing(r);
                        setShowForm(true);
                      }}
                      className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent"
                    >
                      <Pencil className="size-3" /> Edit
                    </button>
                    <button
                      onClick={() => setLiveFor(r)}
                      className="inline-flex items-center justify-center gap-1 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent"
                      title="Live verified video"
                    >
                      <Video className="size-3" />
                      {r.has_verified_video ? " ✓" : ""}
                    </button>
                    <button
                      onClick={() => togglePublish(r)}
                      disabled={busyRoom === r.id}
                      className={`inline-flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium disabled:opacity-60 ${r.is_public ? "border border-border" : "bg-primary text-primary-foreground"}`}
                      title={r.is_public ? "Remove from MYR" : "Show on MYR"}
                    >
                      {busyRoom === r.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : r.is_public ? (
                        <EyeOff className="size-3" />
                      ) : (
                        <Globe2 className="size-3" />
                      )}
                    </button>
                    <button
                      onClick={() => handleDelete(r.id)}
                      className="inline-flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
                No rooms yet. Click <span className="font-medium text-foreground">Add room</span>.
              </div>
            )}
          </div>
        </>
      )}

      {showForm && (
        <RoomForm
          properties={properties}
          initial={editing ?? undefined}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            load();
          }}
        />
      )}
      {liveFor && (
        <div
          className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4"
          onClick={() => setLiveFor(null)}
        >
          <div
            className="bg-card border border-border rounded-2xl w-full max-w-md p-4 space-y-2"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-sm">Room {liveFor.room_number} — Live feed</div>
              <button onClick={() => setLiveFor(null)} className="p-1 rounded-md hover:bg-accent">
                <X className="size-4" />
              </button>
            </div>
            <LiveFeedManager target={{ kind: "room", id: liveFor.id }} />
          </div>
        </div>
      )}
    </AppShell>
  );
}

function RoomForm({
  properties,
  initial,
  onClose,
  onSaved,
}: {
  properties: Property[];
  initial?: Room;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [property_id, setProp] = useState(initial?.property_id ?? properties[0]?.id ?? "");
  const [room_number, setRoomNumber] = useState(initial?.room_number ?? "");
  const [rent_amount, setRent] = useState(initial?.rent_amount?.toString() ?? "");
  const [water_per_person, setWater] = useState(initial?.water_per_person?.toString() ?? "");
  const [cleaning_amount, setCleaning] = useState(initial?.cleaning_amount?.toString() ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const payload = {
      property_id,
      room_number: room_number.trim(),
      rent_amount: Number(rent_amount) || 0,
      water_per_person: water_per_person === "" ? null : Number(water_per_person),
      cleaning_amount: cleaning_amount === "" ? null : Number(cleaning_amount),
      notes: notes || null,
    };
    if (initial) await supabase.from("rooms").update(payload).eq("id", initial.id);
    else {
      const owner_id = await getOwnerId();
      await supabase.from("rooms").insert({ ...payload, owner_id });
    }
    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">{initial ? "Edit room" : "Add room"}</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent">
            <X className="size-4" />
          </button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
          <Field label="Property">
            <select
              required
              value={property_id}
              onChange={(e) => setProp(e.target.value)}
              className={input}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Room number">
            <input
              required
              value={room_number}
              onChange={(e) => setRoomNumber(e.target.value)}
              className={input}
            />
          </Field>
          <Field label="Rent amount (₹)">
            <input
              required
              type="number"
              min="0"
              value={rent_amount}
              onChange={(e) => setRent(e.target.value)}
              className={input}
            />
          </Field>
          <div className="rounded-xl bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">
              Per-room overrides (optional)
            </div>
            <Field label="Water per person (₹)">
              <input
                type="number"
                min="0"
                placeholder="default"
                value={water_per_person}
                onChange={(e) => setWater(e.target.value)}
                className={input}
              />
            </Field>
            <Field label="Cleaning amount (₹)">
              <input
                type="number"
                min="0"
                placeholder="default"
                value={cleaning_amount}
                onChange={(e) => setCleaning(e.target.value)}
                className={input}
              />
            </Field>
          </div>
          <Field label="Notes">
            <input
              value={notes ?? ""}
              onChange={(e) => setNotes(e.target.value)}
              className={input}
            />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-sm rounded-lg border border-border"
            >
              Cancel
            </button>
            <button
              disabled={saving}
              className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const input =
  "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
