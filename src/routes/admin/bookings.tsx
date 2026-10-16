import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Phone, MessageCircle, AlertTriangle, CheckCircle2, ShieldAlert } from "lucide-react";
import { adminListBookings, adminReviewBooking } from "@/lib/admin-bookings.functions";

export const Route = createFileRoute("/admin/bookings")({ component: AdminBookings });

const STATUS = ["all", "pending", "accepted", "rejected", "cancelled", "completed"] as const;
const REVIEW = ["all", "unchecked", "confirmed", "suspicious"] as const;
type Status = (typeof STATUS)[number];
type Review = (typeof REVIEW)[number];

const waLink = (mobile: string) => {
  const d = mobile.replace(/\D/g, "");
  const n = d.length === 10 ? `91${d}` : d;
  return `https://wa.me/${n}`;
};

function AdminBookings() {
  const list = useServerFn(adminListBookings);
  const review = useServerFn(adminReviewBooking);
  const qc = useQueryClient();
  const [status, setStatus] = useState<Status>("all");
  const [rev, setRev] = useState<Review>("unchecked");
  const [text, setText] = useState("");
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin-bookings", status, rev, text],
    queryFn: () => list({ data: { status, review: rev, q: text || undefined } }),
    retry: false,
  });
  const m = useMutation({
    mutationFn: (v: { bookingId: string; review: "unchecked" | "confirmed" | "suspicious"; note?: string }) =>
      review({ data: v }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    },
    onError: (e) => setErr(e instanceof Error ? e.message : "Couldn't save. Please try again."),
  });

  const pill = (on: boolean) =>
    `px-2.5 py-1 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Bookings</h1>
        <p className="text-sm text-muted-foreground">
          Every room booking request with the tenant's mobile number. Call or WhatsApp the tenant
          to confirm the booking is genuine and nothing is being negotiated off-platform, then mark it.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {REVIEW.map((r) => (
          <button key={r} onClick={() => setRev(r)} className={pill(rev === r)}>
            {r === "all" ? "Any review" : r}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {STATUS.map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>
            {s === "all" ? "Any status" : s}
          </button>
        ))}
      </div>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Search tenant / landlord name, mobile, property"
        className="w-full max-w-md px-3 py-2 rounded-lg bg-background border border-input text-sm"
      />
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}

      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : q.isError ? (
        <p className="text-sm text-destructive">
          {q.error instanceof Error ? q.error.message : "Couldn't load bookings."}
        </p>
      ) : q.data!.bookings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bookings match these filters.</p>
      ) : (
        <div className="space-y-3">
          {q.data!.bookings.map((b) => (
            <div key={b.id} className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {b.property} · {b.room}
                    {b.rent != null && (
                      <span className="text-muted-foreground"> · ₹{b.rent.toLocaleString("en-IN")}/mo</span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Requested {new Date(b.createdAt).toLocaleString("en-IN")}
                    {b.decidedAt && ` · decided ${new Date(b.decidedAt).toLocaleString("en-IN")}`}
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5 text-[11px]">
                  <span className="rounded-full bg-muted px-2 py-0.5 capitalize">{b.status}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 ${b.review === "confirmed" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" : b.review === "suspicious" ? "bg-destructive/15 text-destructive" : "bg-amber-500/15 text-amber-700 dark:text-amber-400"}`}
                  >
                    {b.review}
                  </span>
                  {b.termsVersion != null && (
                    <span className="rounded-full bg-muted px-2 py-0.5">
                      {b.termsVersion ? `terms v${b.termsVersion} accepted` : "no terms published"}
                    </span>
                  )}
                  {b.tenantActive === true && (
                    <span className="rounded-full bg-muted px-2 py-0.5">tenant active</span>
                  )}
                  {b.tenantActive === false && (
                    <span className="rounded-full bg-muted px-2 py-0.5">tenant moved out</span>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <Person title="Tenant" p={b.tenant} />
                <Person title="Landlord" p={b.landlord} />
              </div>

              {b.sameMobileBookings > 1 && (
                <p className="text-xs text-amber-700 dark:text-amber-400 inline-flex items-center gap-1">
                  <AlertTriangle className="size-3.5" /> This mobile number appears on{" "}
                  {b.sameMobileBookings} booking requests.
                </p>
              )}
              {b.message && (
                <p className="text-xs text-muted-foreground">Tenant's message: “{b.message}”</p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={note[b.id] ?? b.note ?? ""}
                  onChange={(e) => setNote((n) => ({ ...n, [b.id]: e.target.value }))}
                  placeholder="Note (required if suspicious)"
                  className="flex-1 min-w-48 px-3 py-1.5 rounded-lg bg-background border border-input text-xs"
                />
                <button
                  disabled={m.isPending}
                  onClick={() => m.mutate({ bookingId: b.id, review: "confirmed", note: note[b.id] || undefined })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs disabled:opacity-60"
                >
                  <CheckCircle2 className="size-3.5" /> Genuine
                </button>
                <button
                  disabled={m.isPending}
                  onClick={() => m.mutate({ bookingId: b.id, review: "suspicious", note: note[b.id] || undefined })}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-destructive text-destructive text-xs disabled:opacity-60"
                >
                  <ShieldAlert className="size-3.5" /> Suspicious
                </button>
                {b.review !== "unchecked" && (
                  <button
                    disabled={m.isPending}
                    onClick={() => m.mutate({ bookingId: b.id, review: "unchecked" })}
                    className="px-3 py-1.5 rounded-lg border border-border text-xs"
                  >
                    Reset
                  </button>
                )}
              </div>
              {b.reviewedAt && (
                <p className="text-[11px] text-muted-foreground">
                  Reviewed {new Date(b.reviewedAt).toLocaleString("en-IN")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Person({
  title,
  p,
}: {
  title: string;
  p: { name: string | null; mobile: string | null; email: string | null };
}) {
  return (
    <div className="rounded-lg bg-muted/40 p-3 space-y-1">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{title}</div>
      <div className="font-medium">{p.name || "—"}</div>
      {p.mobile ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono">{p.mobile}</span>
          <a href={`tel:${p.mobile}`} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
            <Phone className="size-3" /> Call
          </a>
          <a
            href={waLink(p.mobile)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
          >
            <MessageCircle className="size-3" /> WhatsApp
          </a>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">No mobile on file</div>
      )}
      {p.email && <div className="text-xs text-muted-foreground break-all">{p.email}</div>}
    </div>
  );
}
