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
    id: string; title: string; city: string | null;
    myr_listing_media: { storage_path: string }[];
    myr_listing_rooms: { rent: number }[];
  } | null;
};

function SavedPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<Row[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { nav({ to: "/login" }); return; }
      const { data } = await supabase
        .from("myr_saved_listings")
        .select("listing_id, myr_listings(id,title,city, myr_listing_media(storage_path), myr_listing_rooms(rent))")
        .eq("user_id", session.user.id);
      const rows = (data ?? []) as unknown as Row[];
      setItems(rows);
      const u: Record<string, string> = {};
      await Promise.all(rows.map(async (r) => {
        const m = r.myr_listings?.myr_listing_media[0];
        if (!m || !r.myr_listings) return;
        const { data: s } = await supabase.storage.from("myr-listings").createSignedUrl(m.storage_path, 3600);
        if (s?.signedUrl) u[r.myr_listings.id] = s.signedUrl;
      }));
      setUrls(u);
      setLoading(false);
    })();
  }, [nav]);

  const remove = async (lid: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("myr_saved_listings").delete().eq("user_id", user.id).eq("listing_id", lid);
    setItems((xs) => xs.filter((x) => x.listing_id !== lid));
  };

  return (
    <MyrShell variant="tenant">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="size-5 text-destructive" />
        <h1 className="text-2xl font-semibold tracking-tight">Saved listings</h1>
      </div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No saved listings yet. <Link to="/myr/browse" className="text-primary underline">Browse</Link></div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((r) => r.myr_listings && (
            <div key={r.listing_id} className="rounded-2xl bg-card border border-border overflow-hidden">
              <Link to="/myr/listing/$id" params={{ id: r.myr_listings.id }} className="block aspect-[4/3] bg-muted">
                {urls[r.myr_listings.id]
                  ? <img src={urls[r.myr_listings.id]} alt={r.myr_listings.title} className="w-full h-full object-cover" />
                  : <div className="w-full h-full grid place-items-center text-xs text-muted-foreground">No photo</div>}
              </Link>
              <div className="p-3 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.myr_listings.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.myr_listings.city || "—"} · from {formatINR(Math.min(...r.myr_listings.myr_listing_rooms.map((x) => Number(x.rent))) || 0)}</div>
                </div>
                <button onClick={() => remove(r.listing_id)} className="text-xs text-destructive hover:underline">Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </MyrShell>
  );
}
