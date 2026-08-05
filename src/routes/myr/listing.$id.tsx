import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { LISTING_TYPE_LABEL, formatINR, type ListingType, type RoomStatus, type Furnishing, type GenderPref } from "@/lib/myr";
import { reserveRoom } from "@/lib/myr.functions";
import { MapPin, ShieldCheck, Star, Loader2, Heart, MessageSquare, ArrowLeft, BedDouble, Clock } from "lucide-react";

export const Route = createFileRoute("/myr/listing/$id")({ component: ListingDetail });

type Listing = {
  id: string;
  landlord_id: string;
  title: string;
  description: string | null;
  type: ListingType;
  address_line: string | null;
  city: string | null;
  state: string | null;
  rules: string | null;
  rating_avg: number | null;
  rating_count: number;
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

type Media = { id: string; storage_path: string; kind: string };

function ListingDetail() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const reserve = useServerFn(reserveRoom);
  const [listing, setListing] = useState<Listing | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [media, setMedia] = useState<(Media & { url: string })[]>([]);
  const [amenities, setAmenities] = useState<{ label: string; code: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: l }, { data: r }, { data: m }, { data: a }, { data: { user } }] = await Promise.all([
        supabase.from("myr_listings").select("*").eq("id", id).single(),
        supabase.from("myr_listing_rooms").select("*").eq("listing_id", id).order("rent"),
        supabase.from("myr_listing_media").select("id,storage_path,kind").eq("listing_id", id).order("sort_order"),
        supabase.from("myr_listing_amenities").select("myr_amenities(label,code)").eq("listing_id", id),
        supabase.auth.getUser(),
      ]);
      setListing(l as Listing);
      setRooms((r ?? []) as Room[]);
      setAmenities(((a ?? []) as { myr_amenities: { label: string; code: string } }[]).map((x) => x.myr_amenities));

      const withUrls = await Promise.all(((m ?? []) as Media[]).map(async (mm) => {
        const { data } = await supabase.storage.from("myr-listings").createSignedUrl(mm.storage_path, 3600);
        return { ...mm, url: data?.signedUrl ?? "" };
      }));
      setMedia(withUrls);

      if (user) {
        const { data: sv } = await supabase.from("myr_saved_listings").select("user_id").eq("user_id", user.id).eq("listing_id", id).maybeSingle();
        setSaved(!!sv);
      }
      setLoading(false);
    })();
  }, [id]);

  const toggleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav({ to: "/login" }); return; }
    if (saved) {
      await supabase.from("myr_saved_listings").delete().eq("user_id", user.id).eq("listing_id", id);
      setSaved(false);
    } else {
      await supabase.from("myr_saved_listings").insert({ user_id: user.id, listing_id: id });
      setSaved(true);
    }
  };

  const onReserve = async (roomId: string) => {
    setErr(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav({ to: "/login" }); return; }
    setBusy(roomId);
    try {
      const res = await reserve({ data: { room_id: roomId, minutes: 10 } });
      nav({ to: "/myr/bookings" });
      void res;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Reservation failed");
    } finally {
      setBusy(null);
    }
  };

  const inquire = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav({ to: "/login" }); return; }
    if (!listing) return;
    const { data: existing } = await supabase
      .from("myr_inquiries").select("id")
      .eq("listing_id", listing.id).eq("tenant_id", user.id).maybeSingle();
    if (!existing) {
      await supabase.from("myr_inquiries").insert({
        listing_id: listing.id, tenant_id: user.id, landlord_id: listing.landlord_id,
        last_message: "Hi, interested in this listing.",
      });
    }
    nav({ to: "/myr/messages" });
  };

  if (loading) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (!listing) return <div className="min-h-screen grid place-items-center bg-background text-sm">Listing not found.</div>;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <button onClick={() => nav({ to: "/myr/browse" })} className="inline-flex items-center gap-1 text-sm hover:underline"><ArrowLeft className="size-4" /> Back</button>
          <button onClick={toggleSave} className={`inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border ${saved ? "border-destructive text-destructive" : "border-border"}`}>
            <Heart className={`size-4 ${saved ? "fill-destructive" : ""}`} /> {saved ? "Saved" : "Save"}
          </button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Gallery */}
        {media.length > 0 && (
          <div className="grid grid-cols-4 gap-2 rounded-2xl overflow-hidden">
            <div className="col-span-4 md:col-span-2 row-span-2 aspect-[4/3] md:aspect-auto bg-muted">
              <img src={media[0].url} alt={listing.title} className="w-full h-full object-cover" />
            </div>
            {media.slice(1, 5).map((m) => (
              <div key={m.id} className="aspect-square bg-muted hidden md:block"><img src={m.url} alt="" className="w-full h-full object-cover" /></div>
            ))}
          </div>
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-primary font-medium">{LISTING_TYPE_LABEL[listing.type]}</div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{listing.title}</h1>
            <div className="text-sm text-muted-foreground mt-1"><MapPin className="size-3.5 inline -mt-0.5" /> {listing.address_line}, {listing.city}</div>
          </div>
          <div className="text-right text-xs space-y-1 shrink-0">
            <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent"><ShieldCheck className="size-3 text-primary" /> Verified</div>
            {listing.rating_count > 0 && (
              <div className="inline-flex items-center gap-1"><Star className="size-3 fill-warning text-warning" /> {Number(listing.rating_avg).toFixed(1)} ({listing.rating_count})</div>
            )}
          </div>
        </div>

        {listing.description && <p className="text-sm leading-relaxed text-foreground/90">{listing.description}</p>}

        {/* Amenities */}
        {amenities.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Amenities</h2>
            <div className="flex flex-wrap gap-2">
              {amenities.map((a) => <span key={a.code} className="text-xs px-2.5 py-1 rounded-full bg-secondary text-secondary-foreground">{a.label}</span>)}
            </div>
          </section>
        )}

        {/* Rooms */}
        <section>
          <h2 className="font-semibold mb-2">Available rooms</h2>
          <div className="space-y-2">
            {rooms.length === 0 && <div className="text-sm text-muted-foreground">Koi room nahi mila.</div>}
            {rooms.map((r) => (
              <div key={r.id} className="rounded-xl bg-card border border-border p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium flex items-center gap-2"><BedDouble className="size-4" /> {r.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                    <span className="capitalize">{r.furnishing}</span>
                    <span className="capitalize">{r.gender_pref}</span>
                    <span>Capacity {r.capacity}</span>
                    {r.available_from && <span>From {r.available_from}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold">{formatINR(Number(r.rent))}<span className="text-xs text-muted-foreground">/mo</span></div>
                  <div className="text-[10px] text-muted-foreground">Deposit {formatINR(Number(r.deposit))}</div>
                  {r.status === "available" ? (
                    <button onClick={() => onReserve(r.id)} disabled={busy === r.id} className="mt-2 inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-60">
                      {busy === r.id ? <Loader2 className="size-3 animate-spin" /> : <Clock className="size-3" />} Reserve · 10 min
                    </button>
                  ) : (
                    <div className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">{r.status}</div>
                  )}
                </div>
              </div>
            ))}
            {err && <div className="text-xs text-destructive">{err}</div>}
          </div>
        </section>

        {listing.rules && (
          <section>
            <h2 className="font-semibold mb-2">House rules</h2>
            <p className="text-sm whitespace-pre-line text-foreground/90">{listing.rules}</p>
          </section>
        )}

        {/* Sticky CTA */}
        <div className="sticky bottom-4 grid grid-cols-2 gap-2 max-w-md mx-auto pt-4">
          <button onClick={inquire} className="inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-xl bg-card border border-border shadow-card">
            <MessageSquare className="size-4" /> Message owner
          </button>
          <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: document.body.scrollHeight / 2, behavior: "smooth" }); }} className="inline-flex items-center justify-center gap-1.5 text-sm px-4 py-2.5 rounded-xl bg-primary text-primary-foreground shadow-card">
            Pick a room
          </a>
        </div>
      </div>
    </div>
  );
}
