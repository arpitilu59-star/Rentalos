import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { LISTING_TYPE_LABEL, type ListingType, type ListingStatus } from "@/lib/myr";
import { Plus, Building2, Loader2, Edit, Eye } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/listings")({ component: MyListings });

type L = { id: string; title: string; type: ListingType; status: ListingStatus; city: string | null; created_at: string };

function MyListings() {
  const [items, setItems] = useState<L[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("myr_listings").select("id,title,type,status,city,created_at").eq("landlord_id", user.id).order("created_at", { ascending: false });
      setItems((data ?? []) as L[]);
      setLoading(false);
    })();
  }, []);

  return (
    <MyrShell variant="landlord">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2"><Building2 className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Your listings</h1></div>
        <Link to="/myr/landlord/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"><Plus className="size-4" /> New</Link>
      </div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No listings yet. <Link to="/myr/landlord/new" className="text-primary underline">Create your first</Link></div>
      ) : (
        <div className="space-y-2">
          {items.map((l) => (
            <div key={l.id} className="rounded-2xl bg-card border border-border p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium truncate">{l.title}</div>
                <div className="text-xs text-muted-foreground">{LISTING_TYPE_LABEL[l.type]} · {l.city || "—"} · <span className="uppercase">{l.status}</span></div>
              </div>
              <div className="flex items-center gap-1 text-xs">
                <Link to="/myr/listing/$id" params={{ id: l.id }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent"><Eye className="size-3" /> View</Link>
                <Link to="/myr/landlord/$id" params={{ id: l.id }} className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-accent text-primary"><Edit className="size-3" /> Edit</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </MyrShell>
  );
}
