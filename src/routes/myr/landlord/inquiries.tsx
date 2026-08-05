import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { MessageSquare, Loader2 } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/inquiries")({ component: LandlordInquiries });

type Row = { id: string; listing_id: string; last_message: string | null; updated_at: string; tenant_id: string; myr_listings: { title: string } | null };

function LandlordInquiries() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("myr_inquiries")
        .select("id,listing_id,last_message,updated_at,tenant_id, myr_listings(title)")
        .eq("landlord_id", user.id)
        .order("updated_at", { ascending: false });
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
  }, []);

  return (
    <MyrShell variant="landlord">
      <div className="flex items-center gap-2 mb-4"><MessageSquare className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Inquiries</h1></div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No inquiries yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <Link key={r.id} to="/myr/messages" className="block rounded-2xl bg-card border border-border p-4 hover:bg-accent/50">
              <div className="font-medium truncate">{r.myr_listings?.title}</div>
              <div className="text-xs text-muted-foreground truncate">{r.last_message || "—"}</div>
            </Link>
          ))}
        </div>
      )}
    </MyrShell>
  );
}
