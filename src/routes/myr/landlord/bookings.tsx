import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { formatINR } from "@/lib/myr";
import { CalendarCheck, Loader2 } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/bookings")({ component: LandlordBookings });

type Row = {
  id: string; status: string; reserved_until: string | null; move_in_date: string | null; amount: number; deposit: number;
  tenant_id: string;
  myr_listings: { title: string } | null;
  myr_listing_rooms: { label: string } | null;
};

function LandlordBookings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.from("myr_bookings")
        .select("id,status,reserved_until,move_in_date,amount,deposit,tenant_id, myr_listings(title), myr_listing_rooms(label)")
        .eq("landlord_id", user.id)
        .order("created_at", { ascending: false });
      setRows((data ?? []) as unknown as Row[]);
      setLoading(false);
    })();
  }, []);

  const confirm = async (id: string, roomLabel?: string) => {
    void roomLabel;
    await supabase.from("myr_bookings").update({ status: "confirmed", reserved_until: null, payment_status: "paid" }).eq("id", id);
    const { data: b } = await supabase.from("myr_bookings").select("room_id").eq("id", id).single();
    if (b) await supabase.from("myr_listing_rooms").update({ status: "occupied", reserved_until: null, reserved_by: null }).eq("id", b.room_id);
    setRows((xs) => xs.map((x) => x.id === id ? { ...x, status: "confirmed" } : x));
  };

  return (
    <MyrShell variant="landlord">
      <div className="flex items-center gap-2 mb-4"><CalendarCheck className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Bookings</h1></div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No bookings yet.</div>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{r.myr_listings?.title} · {r.myr_listing_rooms?.label}</div>
                  <div className="text-xs text-muted-foreground">{formatINR(Number(r.amount))} + deposit {formatINR(Number(r.deposit))}</div>
                </div>
                <div className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${r.status === "reserved" ? "bg-warning text-warning-foreground" : r.status === "confirmed" ? "bg-success text-success-foreground" : "bg-muted text-muted-foreground"}`}>{r.status}</div>
              </div>
              {r.status === "reserved" && (
                <div className="mt-2 flex justify-end">
                  <button onClick={() => confirm(r.id)} className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground">Confirm booking</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </MyrShell>
  );
}
