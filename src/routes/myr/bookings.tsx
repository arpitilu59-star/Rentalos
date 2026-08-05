import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { cancelMyrBooking } from "@/lib/myr.functions";
import { formatINR } from "@/lib/myr";
import { CalendarCheck, Loader2, Clock } from "lucide-react";

export const Route = createFileRoute("/myr/bookings")({ component: BookingsPage });

type Row = {
  id: string; status: string; reserved_until: string | null; move_in_date: string | null;
  amount: number; deposit: number; payment_status: string;
  myr_listings: { id: string; title: string; city: string | null } | null;
  myr_listing_rooms: { label: string } | null;
};

function BookingsPage() {
  const nav = useNavigate();
  const cancel = useServerFn(cancelMyrBooking);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const load = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { nav({ to: "/login" }); return; }
    const { data } = await supabase
      .from("myr_bookings")
      .select("id,status,reserved_until,move_in_date,amount,deposit,payment_status, myr_listings(id,title,city), myr_listing_rooms(label)")
      .eq("tenant_id", session.user.id)
      .order("created_at", { ascending: false });
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const onCancel = async (id: string) => {
    setBusy(id);
    try { await cancel({ data: { booking_id: id } }); await load(); } finally { setBusy(null); }
  };

  return (
    <MyrShell variant="tenant">
      <div className="flex items-center gap-2 mb-4">
        <CalendarCheck className="size-5" />
        <h1 className="text-2xl font-semibold tracking-tight">My bookings</h1>
      </div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No bookings yet. <Link to="/myr/browse" className="text-primary underline">Browse listings</Link></div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const remaining = r.reserved_until ? Math.max(0, new Date(r.reserved_until).getTime() - now) : 0;
            const mm = Math.floor(remaining / 60000), ss = Math.floor((remaining % 60000) / 1000);
            return (
              <div key={r.id} className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{r.myr_listings?.title}</div>
                    <div className="text-xs text-muted-foreground">Room: {r.myr_listing_rooms?.label} · {r.myr_listings?.city}</div>
                  </div>
                  <div className={`text-[10px] uppercase tracking-wide font-medium px-2 py-0.5 rounded-full ${r.status === "reserved" ? "bg-warning text-warning-foreground" : r.status === "confirmed" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{r.status}</div>
                </div>
                <div className="mt-2 text-sm flex items-center justify-between">
                  <div>{formatINR(Number(r.amount))} <span className="text-muted-foreground text-xs">+ deposit {formatINR(Number(r.deposit))}</span></div>
                  {r.status === "reserved" && remaining > 0 && (
                    <span className="inline-flex items-center gap-1 text-xs text-warning"><Clock className="size-3" /> {mm}:{String(ss).padStart(2,"0")}</span>
                  )}
                </div>
                {(r.status === "reserved" || r.status === "confirmed") && (
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => onCancel(r.id)} disabled={busy === r.id} className="text-xs text-destructive hover:underline">
                      {busy === r.id ? "Cancelling…" : "Cancel"}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </MyrShell>
  );
}
