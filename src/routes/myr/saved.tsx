import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { formatINR } from "@/lib/myr";
import { Heart, Loader2 } from "lucide-react";

export const Route = createFileRoute("/myr/saved")({ component: SavedPage });

type Row = {
  listing_id: string;
  myr_listings: {
    id: string;
    title: string;
    city: string | null;
    myr_listing_media: { storage_path: string }[];
    myr_listing_rooms: { rent: number }[];
  } | null;
};

function SavedPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [rooms, setRooms] = useState<
    {
      room_id: string;
      rooms: {
        room_number: string;
        rent_amount: number;
        myr_photos: string[];
        properties: { name: string; myr_city: string | null } | null;
      } | null;
    }[]
  >([]);
  const [error, setError] = useState("");
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        nav({ to: "/login" });
        return;
      }
      const { data: savedRooms, error: roomError } = await supabase
        .from("app_saved_rooms")
        .select("room_id,rooms(room_number,rent_amount,myr_photos,properties(name,myr_city))")
        .eq("user_id", session.user.id);
      if (roomError) throw roomError;
      setRooms((savedRooms ?? []) as unknown as typeof rooms);
      const { data, error: listingError } = await supabase
        .from("myr_saved_listings")
        .select(
          "listing_id, myr_listings(id,title,city, myr_listing_media(storage_path), myr_listing_rooms(rent))",
        )
        .eq("user_id", session.user.id);
      if (listingError) throw listingError;
      const rows = (data ?? []) as unknown as Row[];
      setItems(rows);
      const u: Record<string, string> = {};
      await Promise.all(
        rows.map(async (r) => {
          const m = r.myr_listings?.myr_listing_media[0];
          if (!m || !r.myr_listings) return;
          const { data: s } = await supabase.storage
            .from("myr-listings")
            .createSignedUrl(m.storage_path, 3600);
          if (s?.signedUrl) u[r.myr_listings.id] = s.signedUrl;
        }),
      );
      setUrls(u);
      setLoading(false);
    })().catch(() => {
      setError("Saved rooms could not load. Please refresh and try again.");
      setLoading(false);
    });
  }, [nav]);

  const remove = async (lid: string) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("myr_saved_listings")
      .delete()
      .eq("user_id", user.id)
      .eq("listing_id", lid);
    if (error) {
      setError("Could not remove the listing. Try again.");
      return;
    }
    setItems((xs) => xs.filter((x) => x.listing_id !== lid));
  };

  return (
    <MyrShell variant="tenant">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="size-5 text-destructive" />
        <h1 className="text-2xl font-semibold tracking-tight">Saved places</h1>
      </div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-destructive">
          {error}
        </p>
      )}
      {!loading && rooms.length > 0 && (
        <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rooms.map((r) => (
            <div
              key={r.room_id}
              className="overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-card"
            >
              <Link to="/myr/room/$id" params={{ id: r.room_id }} className="block min-h-20">
                <span className="text-xs uppercase tracking-wider text-muted-foreground">
                  Saved room
                </span>
                <h2 className="mt-2 font-semibold">
                  {r.rooms?.properties?.name ?? "Room unavailable"} · {r.rooms?.room_number}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.rooms?.properties?.myr_city ?? ""}
                  {r.rooms ? ` · ${formatINR(r.rooms.rent_amount)}/month` : ""}
                </p>
              </Link>
              <button
                className="mt-3 min-h-11 text-sm text-destructive"
                onClick={async () => {
                  const { error } = await supabase
                    .from("app_saved_rooms")
                    .delete()
                    .eq("room_id", r.room_id);
                  if (error) setError("Could not remove this room. Try again.");
                  else setRooms((xs) => xs.filter((x) => x.room_id !== r.room_id));
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}
      {loading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 && rooms.length === 0 && !error ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          No saved listings yet.{" "}
          <Link to="/myr/browse" className="text-primary underline">
            Browse
          </Link>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map(
            (r) =>
              r.myr_listings && (
                <div
                  key={r.listing_id}
                  className="rounded-2xl bg-card border border-border overflow-hidden"
                >
                  <Link
                    to="/myr/listing/$id"
                    params={{ id: r.myr_listings.id }}
                    className="block aspect-[4/3] bg-muted"
                  >
                    {urls[r.myr_listings.id] ? (
                      <img
                        src={urls[r.myr_listings.id]}
                        alt={r.myr_listings.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">
                        No photo
                      </div>
                    )}
                  </Link>
                  <div className="p-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{r.myr_listings.title}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {r.myr_listings.city || "—"} · from{" "}
                        {formatINR(
                          r.myr_listings.myr_listing_rooms.length
                            ? Math.min(
                                ...r.myr_listings.myr_listing_rooms.map((x) => Number(x.rent)),
                              )
                            : 0,
                        )}
                      </div>
                    </div>
                    <button
                      onClick={() => remove(r.listing_id)}
                      className="text-xs text-destructive hover:underline"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ),
          )}
        </div>
      )}
    </MyrShell>
  );
}
