import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listLandlordBookings, decideBooking } from "@/lib/bookings.functions";
import { Loader2, Check, X, Clock, Phone, Mail } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/bookings")({ component: BookingsPage });

function BookingsPage() {
  const list = useServerFn(listLandlordBookings);
  const decide = useServerFn(decideBooking);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["landlord-bookings"], queryFn: () => list() });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (booking_id: string, decision: "accept" | "reject") => {
    setBusy(booking_id);
    try {
      await decide({ data: { booking_id, decision } });
      qc.invalidateQueries({ queryKey: ["landlord-bookings"] });
    } catch (e) { alert((e as Error).message); }
    setBusy(null);
  };

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Booking requests</h1>
      <p className="text-muted-foreground mt-1">MYR se aayi hui tenant requests — accept karein to tenant automatically add ho jayega.</p>

      {isLoading ? (
        <div className="mt-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.bookings?.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Koi booking request nahi. Property ko MYR par publish karein to visible ho jayegi.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.bookings.map((b: any) => (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{b.tenant_name}</div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-1">
                    <span className="inline-flex items-center gap-1"><Phone className="size-3" /> {b.tenant_mobile}</span>
                    {b.tenant_email && <span className="inline-flex items-center gap-1"><Mail className="size-3" /> {b.tenant_email}</span>}
                  </div>
                  <div className="text-xs mt-1">
                    {b.properties?.name} · Room {b.rooms?.room_number} · ₹{b.rooms?.rent_amount}/mo
                  </div>
                  {b.message && <div className="mt-2 text-xs text-muted-foreground italic">"{b.message}"</div>}
                </div>
                <StatusBadge status={b.status} />
              </div>
              {b.status === "pending" && (
                <div className="mt-3 flex gap-2 justify-end">
                  <button disabled={busy === b.id} onClick={() => act(b.id, "reject")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /> Reject</button>
                  <button disabled={busy === b.id} onClick={() => act(b.id, "accept")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">
                    {busy === b.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Accept
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls = status === "accepted" ? "bg-primary/15 text-primary" : status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-accent text-accent-foreground";
  const Icon = status === "accepted" ? Check : status === "rejected" ? X : Clock;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}><Icon className="size-3" /> {status}</span>;
}
