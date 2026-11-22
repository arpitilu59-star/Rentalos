import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { listLandlordBookings, decideBooking, decideBookingOffer } from "@/lib/bookings.functions";
import { landlordBookingTermsStatus } from "@/lib/terms.functions";
import { Loader2, Check, X, Clock, Phone, Mail } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/bookings")({ component: BookingsPage });

function BookingsPage() {
  const list = useServerFn(listLandlordBookings);
  const decide = useServerFn(decideBooking);
  const decideOffer = useServerFn(decideBookingOffer);
  const [counterFor, setCounterFor] = useState<string | null>(null);
  const [counterAmt, setCounterAmt] = useState("");
  const qc = useQueryClient();
  const termsFn = useServerFn(landlordBookingTermsStatus);
  const terms = useQuery({ queryKey: ["landlord-booking-terms"], queryFn: () => termsFn() });
  const { data, isLoading } = useQuery({ queryKey: ["landlord-bookings"], queryFn: () => list() });
  const [busy, setBusy] = useState<string | null>(null);

  const act = async (booking_id: string, decision: "accept" | "reject") => {
    setBusy(booking_id);
    try {
      await decide({ data: { booking_id, decision } });
      qc.invalidateQueries({ queryKey: ["landlord-bookings"] });
    } catch (e) {
      alert((e as Error).message);
    }
    setBusy(null);
  };

  const offerAct = async (booking_id: string, action: "approve" | "deny" | "counter") => {
    setBusy(booking_id);
    try {
      if (action === "counter") {
        const n = Number(counterAmt.replace(/[, ₹]/g, ""));
        if (!Number.isFinite(n) || n <= 0) throw new Error("Counter amount sahi likhein.");
        await decideOffer({ data: { booking_id, action, counter_rent: n } });
        setCounterFor(null);
        setCounterAmt("");
      } else {
        await decideOffer({ data: { booking_id, action } });
      }
    } catch (e) {
      alert((e as Error).message);
    }
    qc.invalidateQueries({ queryKey: ["landlord-bookings"] });
    setBusy(null);
  };

  return (
    <AppShell>
      <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Booking requests</h1>
      <p className="text-muted-foreground mt-1">
        Rentalos se aayi hui tenant requests — accept karein to tenant automatically add ho jayega.
      </p>

      {isLoading ? (
        <div className="mt-10 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.bookings?.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Koi booking request nahi. Property ko Rentalos par publish karein to visible ho jayegi.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.bookings.map((b) => (
            <div key={b.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium flex items-center gap-2">
                    {b.tenant_name}
                    {b.tenant_verified && (
                      <span className="text-[10px] rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-2 py-0.5">
                        ✔ Verified tenant
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 mt-1">
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" />{" "}
                      {b.tenant_mobile || "Contact confirmation ke baad milega"}
                    </span>
                    {b.tenant_email && (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" /> {b.tenant_email}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-1">
                    {b.properties?.name} · Room {b.rooms?.room_number} · ₹{b.rooms?.rent_amount}/mo
                  </div>
                  {terms.data?.[b.id] && (
                    <div
                      className={`mt-1 text-[11px] ${terms.data[b.id].needs ? "text-warning" : "text-muted-foreground"}`}
                    >
                      {terms.data[b.id].accepted
                        ? terms.data[b.id].needs
                          ? `Accepted terms v${terms.data[b.id].accepted} — waiting to accept v${terms.data[b.id].current}`
                          : `Terms v${terms.data[b.id].accepted} accepted`
                        : "No structured terms on this request"}
                    </div>
                  )}
                  {b.offer_status && (
                    <div className="mt-2 rounded-lg border border-border bg-muted/30 p-2.5 text-xs">
                      {b.offer_status === "pending" && (
                        <div>
                          <b>Rent offer: ₹{Number(b.offered_rent).toLocaleString("en-IN")}</b>{" "}
                          (listed ₹{Number(b.rooms?.rent_amount ?? 0).toLocaleString("en-IN")}).
                          Approve, deny ya counter karein.
                        </div>
                      )}
                      {b.offer_status === "countered" && (
                        <div>
                          Aapka counter ₹{Number(b.counter_rent).toLocaleString("en-IN")} — tenant
                          ke jawab ka intezaar
                          {b.offer_expires_at
                            ? ` (till ${new Date(b.offer_expires_at).toLocaleString()})`
                            : ""}
                          .
                        </div>
                      )}
                      {b.offer_status === "approved" && (
                        <div>
                          <b>Agreed rent: ₹{Number(b.agreed_rent).toLocaleString("en-IN")}/month</b>{" "}
                          — tenant 24 ghante mein confirm karega, tab tenancy isi rent par banegi.
                        </div>
                      )}
                      {["declined", "expired", "withdrawn"].includes(b.offer_status) && (
                        <div>Offer {b.offer_status}.</div>
                      )}
                    </div>
                  )}
                  {b.message && (
                    <div className="mt-2 text-xs text-muted-foreground italic">"{b.message}"</div>
                  )}
                </div>
                <StatusBadge status={b.status} />
              </div>
              {b.status === "pending" && b.offer_status === "pending" && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2 justify-end">
                    <button
                      disabled={busy === b.id}
                      onClick={() => offerAct(b.id, "deny")}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"
                    >
                      <X className="size-3" /> Deny
                    </button>
                    <button
                      disabled={busy === b.id}
                      onClick={() => {
                        setCounterFor(counterFor === b.id ? null : b.id);
                        setCounterAmt("");
                      }}
                      className="text-xs px-3 py-1.5 rounded-md border border-border"
                    >
                      Counter
                    </button>
                    <button
                      disabled={busy === b.id}
                      onClick={() => offerAct(b.id, "approve")}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium"
                    >
                      {busy === b.id ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Check className="size-3" />
                      )}{" "}
                      Approve offer
                    </button>
                  </div>
                  {counterFor === b.id && (
                    <div className="flex gap-2 justify-end">
                      <input
                        value={counterAmt}
                        onChange={(e) => setCounterAmt(e.target.value)}
                        inputMode="numeric"
                        placeholder={`₹ (${Number(b.offered_rent) + 1} – ${Number(b.rooms?.rent_amount ?? 0)})`}
                        className="w-40 px-2 py-1.5 rounded-md bg-background border border-input text-xs"
                      />
                      <button
                        disabled={busy === b.id}
                        onClick={() => offerAct(b.id, "counter")}
                        className="text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground"
                      >
                        Send counter
                      </button>
                    </div>
                  )}
                </div>
              )}
              {b.status === "pending" && !b.offer_status && (
                <div className="mt-3 flex gap-2 justify-end">
                  <button
                    disabled={busy === b.id}
                    onClick={() => act(b.id, "reject")}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="size-3" /> Reject
                  </button>
                  <button
                    disabled={busy === b.id}
                    onClick={() => act(b.id, "accept")}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium"
                  >
                    {busy === b.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Check className="size-3" />
                    )}{" "}
                    Accept
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
  const cls =
    status === "accepted"
      ? "bg-primary/15 text-primary"
      : status === "rejected"
        ? "bg-destructive/15 text-destructive"
        : "bg-accent text-accent-foreground";
  const Icon = status === "accepted" ? Check : status === "rejected" ? X : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cls}`}
    >
      <Icon className="size-3" /> {status}
    </span>
  );
}
