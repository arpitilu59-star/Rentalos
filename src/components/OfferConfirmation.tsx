import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { confirmBookingOffer } from "@/lib/bookings.functions";
export function OfferConfirmation({
  bookingId,
  rent,
  expiresAt,
}: {
  bookingId: string;
  rent: number;
  expiresAt: string | null;
}) {
  const qc = useQueryClient(),
    confirm = useServerFn(confirmBookingOffer);
  const [moveIn, setMoveIn] = useState(() =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date()),
  );
  const [agreed, setAgreed] = useState(false);
  const m = useMutation({
    mutationFn: () => confirm({ data: { booking_id: bookingId, move_in_date: moveIn } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["my-room-requests"] });
    },
  });
  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-sm font-semibold">Confirm at ₹{rent.toLocaleString("en-IN")}/month</p>
      <p className="text-xs text-muted-foreground">
        {expiresAt ? `Confirm before ${new Date(expiresAt).toLocaleString("en-IN")}. ` : ""}Your
        agreed rent will be used for the tenancy and bills.
      </p>
      <label className="block text-sm">
        Move-in date
        <input
          aria-label="Move-in date"
          type="date"
          required
          value={moveIn}
          onChange={(e) => setMoveIn(e.target.value)}
          className="ml-3 min-h-11 rounded-lg border border-input bg-background px-3"
        />
      </label>
      <label className="flex items-start gap-2 text-xs leading-relaxed">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-1"
        />
        I commit to this booking at the agreed rent and my accepted rental terms. No payment is
        collected by this confirmation.
      </label>
      {m.isError && (
        <p role="alert" className="text-xs text-destructive">
          {m.error.message}
        </p>
      )}
      <button
        disabled={!agreed || !moveIn || m.isPending}
        onClick={() => m.mutate()}
        className="min-h-11 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        {m.isPending ? "Confirming…" : "Confirm booking"}
      </button>
    </div>
  );
}
