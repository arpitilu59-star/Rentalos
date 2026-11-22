import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import {
  uploadListingMedia,
  type Furnishing,
  type GenderPref,
  type ListingStatus,
  type RoomStatus,
} from "@/lib/myr";
import { Loader2, ArrowLeft, Plus, Trash2, Image as ImageIcon } from "lucide-react";
import { LiveFeedManager } from "@/components/LiveFeedManager";

export const Route = createFileRoute("/myr/landlord/$id")({ component: EditListing });

type Listing = {
  id: string;
  landlord_id: string;
  title: string;
  description: string | null;
  status: ListingStatus;
  address_line: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  rules: string | null;
};
type Room = {
  id: string;
  label: string;
  rent: number;
  deposit: number;
  capacity: number;
  furnishing: Furnishing;
  gender_pref: GenderPref;
  status: RoomStatus;
  available_from: string | null;
};
type Media = { id: string; storage_path: string; kind: string; url?: string };

function EditListing() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [l, setL] = useState<Listing | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [media, setMedia] = useState<Media[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingMeta, setSavingMeta] = useState(false);
  const [step, setStep] = useState(0);
  const [notice, setNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    const [
      { data: lr, error: listError },
      { data: rr, error: roomsError },
      { data: mr, error: mediaError },
    ] = await Promise.all([
      supabase.from("myr_listings").select("*").eq("id", id).single(),
      supabase.from("myr_listing_rooms").select("*").eq("listing_id", id).order("created_at"),
      supabase.from("myr_listing_media").select("*").eq("listing_id", id).order("sort_order"),
    ]);
    if (listError || roomsError || mediaError) {
      setNotice("Listing could not load. Please try again.");
      setLoading(false);
      return;
    }
    setL(lr as Listing);
    setRooms((rr ?? []) as Room[]);
    const withUrls = await Promise.all(
      ((mr ?? []) as Media[]).map(async (m) => {
        const { data } = await supabase.storage
          .from("myr-listings")
          .createSignedUrl(m.storage_path, 3600);
        return { ...m, url: data?.signedUrl };
      }),
    );
    setMedia(withUrls);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const saveMeta = async () => {
    if (!l) return;
    setSavingMeta(true);
    const { error } = await supabase
      .from("myr_listings")
      .update({
        title: l.title,
        description: l.description,
        address_line: l.address_line,
        city: l.city,
        state: l.state,
        pincode: l.pincode,
        rules: l.rules,
      })
      .eq("id", l.id);
    setSavingMeta(false);
    if (error) {
      setNotice("Details could not save. Try again.");
      return false;
    }
    return true;
  };

  const addRoom = async () => {
    if (!l) return;
    const { data, error } = await supabase
      .from("myr_listing_rooms")
      .insert({ listing_id: l.id, label: "New room", rent: 0 })
      .select("*")
      .single();
    if (error) {
      setNotice("Room could not be added. Try again.");
      return;
    }
    setRooms((xs) => [...xs, data as Room]);
  };

  const updateRoom = async (r: Room) => {
    const { error } = await supabase
      .from("myr_listing_rooms")
      .update({
        label: r.label,
        rent: r.rent,
        deposit: r.deposit,
        capacity: r.capacity,
        furnishing: r.furnishing,
        gender_pref: r.gender_pref,
        available_from: r.available_from,
      })
      .eq("id", r.id);
    if (error) setNotice("Room details could not save. Try again.");
    return !error;
  };

  const removeRoom = async (rid: string) => {
    if (!confirm("Delete this room?")) return;
    const {error}=await supabase.from("myr_listing_rooms").delete().eq("id", rid);
    if(error)setNotice("Room could not be removed.");
    else setRooms(xs=>xs.filter(r=>r.id!==rid));
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || !l) return;
    setUploading(true);
    try {
      for (const f of Array.from(files)) {
        await uploadListingMedia(l.landlord_id, l.id, f);
      }
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeMedia = async (m: Media) => {
    if (!confirm("Delete this image?")) return;
    await supabase.storage.from("myr-listings").remove([m.storage_path]);
    await supabase.from("myr_listing_media").delete().eq("id", m.id);
    await load();
  };

  const roomsReady =
    rooms.length > 0 && rooms.every((r) => r.label.trim() && r.rent > 0 && r.capacity > 0);
  const photoReady = media.some((m) => m.kind !== "video");
  const persist = async () =>
    Boolean(await saveMeta()) && (await Promise.all(rooms.map(updateRoom))).every(Boolean);
  const goStep = async (next: number) => {
    if (submitting || uploading) return;
    setNotice("");
    setSubmitting(true);
    try {
      if (await persist()) setStep(next);
    } catch {
      setNotice("Could not save. Your edits are still here.");
    } finally {
      setSubmitting(false);
    }
  };
  const publish = async () => {
    if (!l || !roomsReady || !photoReady || submitting) return;
    setSubmitting(true);
    setNotice("");
    try {
      if (!(await persist())) return;
      const { error } = await supabase
        .from("myr_listings")
        .update({ status: "pending_review" })
        .eq("id", l.id);
      if (error) throw error;
      setL({ ...l, status: "pending_review" });
    } catch {
      setNotice("Submission failed. Your draft is available to try again.");
    } finally {
      setSubmitting(false);
    }
  };
  if (loading || !l)
    return (
      <MyrShell variant="landlord">
        <div className="py-20 grid place-items-center">
          {loading ? (
            <Loader2 className="size-6 animate-spin" />
          ) : (
            <button onClick={() => void load()}>{notice} Reload</button>
          )}
        </div>
      </MyrShell>
    );

  return (
    <MyrShell variant="landlord">
      <button
        onClick={() => nav({ to: "/myr/landlord/listings" })}
        className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"
      >
        <ArrowLeft className="size-4" /> Back
      </button>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h1 className="text-2xl font-semibold tracking-tight">Edit listing</h1>
        <div className="flex items-center gap-2">
          <div
            className={`text-[10px] uppercase font-medium px-2 py-1 rounded-full ${l.status === "active" ? "bg-success text-success-foreground" : l.status === "pending_review" ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"}`}
          >
            {l.status}
          </div>
        </div>
      </div>

      <nav
        aria-label="Listing steps"
        className="mb-5 grid grid-cols-3 gap-1 rounded-2xl border border-border bg-card p-1"
      >
        {["Room details", "Photos & video", "Review"].map((label, n) => (
          <button
            key={label}
            disabled={submitting || uploading}
            aria-current={n === step ? "step" : undefined}
            onClick={() => void goStep(n)}
            className={`min-h-12 rounded-xl px-2 text-sm font-medium ${n === step ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
          >
            {n + 1}. {label}
          </button>
        ))}
      </nav>
      {notice && (
        <p role="alert" className="my-4 text-destructive">
          {notice}
        </p>
      )}
      <div className="mx-auto max-w-3xl space-y-4">
        {/* Meta */}
        <div hidden={step !== 0} className="space-y-4">
          <div className="rounded-2xl bg-card border border-border p-5 space-y-3">
            <Field label="Title" value={l.title} onChange={(v) => setL({ ...l, title: v })} />
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Description</span>
              <textarea
                value={l.description ?? ""}
                onChange={(e) => setL({ ...l, description: e.target.value })}
                rows={3}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
              />
            </label>
            <Field
              label="Address"
              value={l.address_line ?? ""}
              onChange={(v) => setL({ ...l, address_line: v })}
            />
            <div className="grid grid-cols-3 gap-2">
              <Field label="City" value={l.city ?? ""} onChange={(v) => setL({ ...l, city: v })} />
              <Field
                label="State"
                value={l.state ?? ""}
                onChange={(v) => setL({ ...l, state: v })}
              />
              <Field
                label="Pincode"
                value={l.pincode ?? ""}
                onChange={(v) => setL({ ...l, pincode: v })}
              />
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Rules</span>
              <textarea
                value={l.rules ?? ""}
                onChange={(e) => setL({ ...l, rules: e.target.value })}
                rows={2}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
              />
            </label>
            <button
              onClick={saveMeta}
              disabled={savingMeta}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            >
              {savingMeta && <Loader2 className="size-4 animate-spin" />} Save details
            </button>
          </div>

          {/* Rooms */}
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">Rooms</div>
              <button
                onClick={addRoom}
                className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
              >
                <Plus className="size-3" /> Add
              </button>
            </div>
            <div className="space-y-3">
              {rooms.map((r) => (
                <div key={r.id} className="rounded-xl border border-border p-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Label"
                      value={r.label}
                      onChange={(v) =>
                        setRooms((xs) => xs.map((x) => (x.id === r.id ? { ...x, label: v } : x)))
                      }
                    />
                    <Field
                      label="Rent"
                      value={String(r.rent)}
                      onChange={(v) =>
                        setRooms((xs) =>
                          xs.map((x) => (x.id === r.id ? { ...x, rent: Number(v) || 0 } : x)),
                        )
                      }
                    />
                    <Field
                      label="Deposit"
                      value={String(r.deposit)}
                      onChange={(v) =>
                        setRooms((xs) =>
                          xs.map((x) => (x.id === r.id ? { ...x, deposit: Number(v) || 0 } : x)),
                        )
                      }
                    />
                    <Field
                      label="Capacity"
                      value={String(r.capacity)}
                      onChange={(v) =>
                        setRooms((xs) =>
                          xs.map((x) => (x.id === r.id ? { ...x, capacity: Number(v) || 1 } : x)),
                        )
                      }
                    />
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Furnishing</span>
                      <select
                        value={r.furnishing}
                        onChange={(e) =>
                          setRooms((xs) =>
                            xs.map((x) =>
                              x.id === r.id
                                ? { ...x, furnishing: e.target.value as Furnishing }
                                : x,
                            ),
                          )
                        }
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
                      >
                        <option value="unfurnished">Unfurnished</option>
                        <option value="semi">Semi</option>
                        <option value="full">Fully</option>
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-muted-foreground">Gender</span>
                      <select
                        value={r.gender_pref}
                        onChange={(e) =>
                          setRooms((xs) =>
                            xs.map((x) =>
                              x.id === r.id
                                ? { ...x, gender_pref: e.target.value as GenderPref }
                                : x,
                            ),
                          )
                        }
                        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
                      >
                        <option value="any">Any</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                      </select>
                    </label>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                      {r.status}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateRoom(r)}
                        className="text-xs px-3 py-1 rounded-md bg-primary text-primary-foreground"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => removeRoom(r.id)}
                        className="text-xs px-3 py-1 rounded-md text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {rooms.length === 0 && (
                <div className="text-xs text-muted-foreground text-center py-6">No rooms yet</div>
              )}
            </div>
          </div>

          {/* Listing-level live feed */}
        </div>

        {/* Media */}
        <div hidden={step !== 1} className="rounded-2xl bg-card border border-border p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-medium flex items-center gap-2">
              <ImageIcon className="size-4" /> Listing photos
            </h2>
            <label className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground cursor-pointer">
              {uploading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Plus className="size-3" />
              )}{" "}
              Add
              <input
                type="file"
                multiple
                accept="image/*,video/*"
                onChange={onUpload}
                className="hidden"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {media.map((m) => (
              <div
                key={m.id}
                className="relative aspect-square bg-muted rounded-lg overflow-hidden"
              >
                {m.url &&
                  (m.kind === "video" ? (
                    <video src={m.url} className="w-full h-full object-cover" />
                  ) : (
                    <img src={m.url} alt="" className="w-full h-full object-cover" />
                  ))}
                <button
                  onClick={() => removeMedia(m)}
                  className="absolute top-1 right-1 size-6 rounded-full bg-background/80 backdrop-blur grid place-items-center text-destructive"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            ))}
            {media.length === 0 && (
              <div className="col-span-2 text-xs text-muted-foreground text-center py-6">
                Add photos to publish
              </div>
            )}
          </div>
          {step === 1 && (
            <div className="mt-5 space-y-3">
              <LiveFeedManager
                target={{ kind: "myr_listing", id: l.id }}
                label="Property video (optional)"
              />
              {rooms.map((r) => (
                <LiveFeedManager
                  key={r.id}
                  target={{ kind: "myr_room", id: r.id }}
                  label={r.label + " · room video (optional)"}
                />
              ))}
            </div>
          )}
        </div>
        {step === 2 && (
          <section className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="text-xl font-semibold">{l.title}</h2>
            <p>{[l.city, l.state].filter(Boolean).join(", ")}</p>
            {rooms.map((r) => (
              <p key={r.id}>
                {r.label} · ₹{r.rent.toLocaleString("en-IN")}/month · {r.capacity} beds
              </p>
            ))}
            <p>{media.filter((m) => m.kind !== "video").length} photos</p>
            {!roomsReady && (
              <button onClick={() => void goStep(0)} className="block underline">
                Add a room with a name, rent and capacity
              </button>
            )}
            {!photoReady && (
              <button onClick={() => void goStep(1)} className="block underline">
                Add a listing photo
              </button>
            )}
            {l.status === "pending_review" && (
              <p role="status">Submitted for review. You can check the status in Your listings.</p>
            )}
          </section>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          {step < 2 ? (
            <button
              disabled={submitting || uploading}
              onClick={() => void goStep(step + 1)}
              className="min-h-12 rounded-xl bg-primary px-5 font-medium text-primary-foreground"
            >
              {submitting ? "Saving…" : step === 0 ? "Save & add photos" : "Review listing"}
            </button>
          ) : (
            l.status === "draft" && (
              <button
                disabled={submitting || !roomsReady || !photoReady}
                onClick={() => void publish()}
                className="min-h-12 rounded-xl bg-primary px-5 font-medium text-primary-foreground disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit for review"}
              </button>
            )
          )}
        </div>
      </div>
    </MyrShell>
  );
}

function Field({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40"
      />
    </label>
  );
}
