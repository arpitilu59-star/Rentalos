import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { Plus, Building2, Eye, MessageSquare, CalendarCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/")({ component: LandlordDashboard });

type Stats = { listings: number; active: number; rooms: number; available: number; inquiries: number; bookings: number };

function LandlordDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: l }, { data: r }, { data: i }, { data: b }] = await Promise.all([
        supabase.from("myr_listings").select("id,status").eq("landlord_id", user.id),
        supabase.from("myr_listing_rooms").select("id,status, myr_listings!inner(landlord_id)").eq("myr_listings.landlord_id", user.id),
        supabase.from("myr_inquiries").select("id").eq("landlord_id", user.id),
        supabase.from("myr_bookings").select("id").eq("landlord_id", user.id),
      ]);
      const ls = (l ?? []) as { id: string; status: string }[];
      const rs = (r ?? []) as { id: string; status: string }[];
      setStats({
        listings: ls.length,
        active: ls.filter((x) => x.status === "active").length,
        rooms: rs.length,
        available: rs.filter((x) => x.status === "available").length,
        inquiries: (i ?? []).length,
        bookings: (b ?? []).length,
      });
    })();
  }, []);

  return (
    <MyrShell variant="landlord">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Landlord dashboard</h1>
          <p className="text-sm text-muted-foreground">Apni listings aur inquiries manage karein.</p>
        </div>
        <Link to="/myr/landlord/new" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"><Plus className="size-4" /> New listing</Link>
      </div>

      {!stats ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
          <StatCard label="Listings" value={`${stats.active}/${stats.listings}`} hint="active / total" icon={Building2} />
          <StatCard label="Rooms" value={`${stats.available}/${stats.rooms}`} hint="available / total" icon={Eye} />
          <StatCard label="Inquiries" value={String(stats.inquiries)} icon={MessageSquare} />
          <StatCard label="Bookings" value={String(stats.bookings)} icon={CalendarCheck} />
        </div>
      )}

      <div className="rounded-2xl bg-card border border-border p-5 text-sm">
        <div className="font-medium mb-1">Next steps</div>
        <ul className="list-disc list-inside text-muted-foreground space-y-1">
          <li><Link to="/myr/landlord/listings" className="text-primary underline">Manage your listings</Link> — photos, rooms, pricing</li>
          <li><Link to="/myr/landlord/verify" className="text-primary underline">Verify your account</Link> — get a Verified Owner badge</li>
        </ul>
      </div>
    </MyrShell>
  );
}

function StatCard({ label, value, hint, icon: Icon }: { label: string; value: string; hint?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className="size-4" /></div>
      <div className="mt-2 text-xl font-semibold">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
