import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Upload, CheckCircle2, Clock, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { PlanComparison } from "@/components/subscription/PlanComparison";
import type { PlanRow, FeatureRow, EntRow } from "@/components/subscription/plan-view";
import {
  getGatewayStatus,
  startGatewayPayment,
  confirmGatewayPayment,
  cancelMyPendingPayment,
  getMySubscription,
  getPublicPlans,
  submitSubscriptionPayment,
} from "@/lib/subscription.functions";
import { PLAN_LABELS, type PlanCode } from "@/lib/subscription/keys";

export const Route = createFileRoute("/_authenticated/subscription")({
  component: SubscriptionPage,
});

const MAX_PROOF = 5 * 1024 * 1024;
function loadRazorpay(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as unknown as { Razorpay?: unknown }).Razorpay) return resolve();
    const el = document.createElement("script");
    el.src = "https://checkout.razorpay.com/v1/checkout.js";
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("Couldn't load the payment window. Check your connection."));
    document.head.appendChild(el);
  });
}

const PROOF_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  FREE: { label: "Free plan", tone: "bg-muted text-foreground" },
  PENDING: {
    label: "Payment under review",
    tone: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  ACTIVE: { label: "Active", tone: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  EXPIRED: { label: "Expired", tone: "bg-destructive/15 text-destructive" },
  SUSPENDED: { label: "Suspended", tone: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "Cancelled", tone: "bg-muted text-foreground" },
};

function SubscriptionPage() {
  const qc = useQueryClient();
  const fetchMine = useServerFn(getMySubscription);
  const fetchPlans = useServerFn(getPublicPlans);
  const q = useQuery({ queryKey: ["my-subscription"], queryFn: () => fetchMine() });
  const matrix = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => fetchPlans(),
    staleTime: 60_000,
  });
  const [buy, setBuy] = useState<PlanRow | null>(null);

  if (q.isLoading || matrix.isLoading) {
    return (
      <AppShell>
        <div className="p-10 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }
  if (q.error || matrix.error || !q.data || !matrix.data) {
    return (
      <AppShell>
        <div className="p-6 max-w-xl mx-auto text-sm">
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4">
            Couldn't load your subscription.{" "}
            <button
              className="underline"
              onClick={() => {
                q.refetch();
                matrix.refetch();
              }}
            >
              Try again
            </button>
          </div>
        </div>
      </AppShell>
    );
  }

  const { entitlements: ent, prices, payments, payment } = q.data;
  const plans = matrix.data.plans as PlanRow[];
  const pending = payments.find((p: { status: string }) => p.status === "PENDING_REVIEW");
  const status = STATUS_COPY[ent.status] ?? STATUS_COPY.FREE;
  const daysLeft = ent.expires_at
    ? Math.ceil((new Date(ent.expires_at).getTime() - Date.now()) / 86400000)
    : null;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["my-subscription"] });
    qc.invalidateQueries({ queryKey: ["my-entitlements"] });
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Subscription</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Your plan, what it includes, and how to upgrade. Your data is never deleted when a plan
            ends.
          </p>
        </header>

        <section className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-center gap-x-8 gap-y-3">
          <div>
            <div className="text-xs text-muted-foreground">Current plan</div>
            <div className="text-lg font-semibold">
              {PLAN_LABELS[ent.plan_code as PlanCode] ?? ent.plan_code}
            </div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Status</div>
            <span
              className={`inline-block mt-0.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${status.tone}`}
            >
              {status.label}
            </span>
          </div>
          {ent.expires_at && (
            <div>
              <div className="text-xs text-muted-foreground">
                {ent.status === "ACTIVE" ? "Renews / ends" : "Ended"}
              </div>
              <div className="text-sm font-medium">
                {new Date(ent.expires_at).toLocaleDateString("en-IN", {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
                {ent.status === "ACTIVE" && daysLeft !== null && (
                  <span className="text-muted-foreground">
                    {" "}
                    · {Math.max(daysLeft, 0)} day(s) left
                  </span>
                )}
              </div>
            </div>
          )}
          {ent.source === "legacy_grandfather" && ent.status === "ACTIVE" && (
            <div className="text-xs text-primary rounded-lg bg-primary/10 px-3 py-2">
              Complimentary RentDesk for early landlords.
            </div>
          )}
          {ent.source === "admin_grant" && ent.status === "ACTIVE" && (
            <div className="text-xs text-primary rounded-lg bg-primary/10 px-3 py-2">
              Access granted by the Rentalos team.
            </div>
          )}
        </section>

        {ent.limits && (
          <p className="text-xs text-muted-foreground">
            Limits on your plan:{" "}
            {ent.limits.max_properties === null ? "unlimited" : ent.limits.max_properties}{" "}
            properties, {ent.limits.max_rooms === null ? "unlimited" : ent.limits.max_rooms} rooms.
          </p>
        )}

        {pending && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-sm flex flex-wrap items-center gap-3">
            <Clock className="size-4 shrink-0" />
            <div className="flex-1 min-w-[200px]">
              Your payment of ₹{Number(pending.amount)} is waiting for review. Plan access starts
              only after the team approves it.
              {pending.clarification_requested && pending.admin_note && (
                <div className="mt-1 flex gap-1.5 text-foreground">
                  <AlertCircle className="size-4 shrink-0" /> Team note: {pending.admin_note}
                </div>
              )}
            </div>
            <CancelButton id={pending.id} onDone={refresh} />
          </div>
        )}

        <PlanComparison
          plans={plans}
          features={matrix.data.features as FeatureRow[]}
          entitlements={matrix.data.entitlements as EntRow[]}
          currentCode={ent.plan_code}
          prices={prices}
          action={(plan) =>
            plan.code === "FREE" ? null : (
              <button
                disabled={
                  !!pending || (ent.plan_code === plan.code && ent.status === "ACTIVE" && false)
                }
                onClick={() => setBuy(plan)}
                className="w-full rounded-xl bg-primary text-primary-foreground py-2.5 text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {ent.plan_code === plan.code && ent.status === "ACTIVE"
                  ? "Renew / extend"
                  : "Upgrade"}
              </button>
            )
          }
        />

        {payments.length > 0 && (
          <section>
            <h2 className="font-semibold mb-2">Payment history</h2>
            <div className="rounded-xl border border-border divide-y divide-border bg-card text-sm">
              {payments.map(
                (p: {
                  id: string;
                  status: string;
                  amount: number;
                  submitted_at: string;
                  admin_note: string | null;
                  transaction_reference: string | null;
                }) => (
                  <div key={p.id} className="p-3 flex flex-wrap items-center gap-3">
                    {p.status === "APPROVED" ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : p.status === "REJECTED" ? (
                      <XCircle className="size-4 text-destructive" />
                    ) : (
                      <Clock className="size-4 text-amber-600" />
                    )}
                    <span className="font-medium">₹{Number(p.amount)}</span>
                    <span className="text-muted-foreground">
                      {new Date(p.submitted_at).toLocaleDateString("en-IN")}
                    </span>
                    <span className="text-xs rounded-full bg-muted px-2 py-0.5">
                      {p.status.replace("_", " ").toLowerCase()}
                    </span>
                    {p.status === "REJECTED" && p.admin_note && (
                      <span className="text-xs text-destructive">Reason: {p.admin_note}</span>
                    )}
                  </div>
                ),
              )}
            </div>
          </section>
        )}
      </div>

      {buy && (
        <PayDialog
          plan={buy}
          price={prices[buy.code]}
          info={payment}
          onClose={() => setBuy(null)}
          onDone={() => {
            setBuy(null);
            refresh();
          }}
        />
      )}
    </AppShell>
  );
}

function CancelButton({ id, onDone }: { id: string; onDone: () => void }) {
  const cancel = useServerFn(cancelMyPendingPayment);
  const m = useMutation({
    mutationFn: () => cancel({ data: { paymentId: id } }),
    onSuccess: () => {
      toast.success("Payment request cancelled.");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <button
      onClick={() => m.mutate()}
      disabled={m.isPending}
      className="text-xs underline disabled:opacity-50"
    >
      {m.isPending ? "Cancelling…" : "Cancel request"}
    </button>
  );
}

function PayDialog({
  plan,
  price,
  info,
  onClose,
  onDone,
}: {
  plan: PlanRow;
  price?: { original: number; discount: number; payable: number };
  info: {
    upiId: string | null;
    payeeName: string | null;
    instructions: string | null;
    qrUrl: string | null;
  };
  onClose: () => void;
  onDone: () => void;
}) {
  const submit = useServerFn(submitSubscriptionPayment);
  const gwStatus = useServerFn(getGatewayStatus);
  const gwStart = useServerFn(startGatewayPayment);
  const gwConfirm = useServerFn(confirmGatewayPayment);
  const gw = useQuery({ queryKey: ["gateway-status"], queryFn: () => gwStatus() });
  const [txn, setTxn] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const payable = price?.payable ?? Number(plan.price_inr);
  const free = payable === 0;
  const qrReady = !!info.qrUrl || !!info.upiId;

  const pick = (f: File | null) => {
    setErr(null);
    if (!f) return setFile(null);
    if (!PROOF_TYPES.includes(f.type)) return setErr("Upload a JPG, PNG, WebP or PDF screenshot.");
    if (f.size > MAX_PROOF) return setErr("File is too large. Maximum is 5 MB.");
    setFile(f);
  };

  const payOnline = async () => {
    setErr(null);
    setBusy(true);
    try {
      const o = await gwStart({ data: { planCode: plan.code as "RENTDESK" | "RENTALOS_MANAGEMENT" } });
      await loadRazorpay();
      const Rzp = (window as unknown as { Razorpay?: new (o: unknown) => { open: () => void; on: (e: string, f: (r: { error?: { description?: string } }) => void) => void } }).Razorpay;
      if (!Rzp) throw new Error("Couldn't load the payment window. Check your connection.");
      const rz = new Rzp({
        key: o.keyId,
        order_id: o.orderId,
        amount: o.amountPaise,
        currency: "INR",
        name: "Rentalos",
        description: plan.name,
        handler: async (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await gwConfirm({ data: { orderId: r.razorpay_order_id, paymentId: r.razorpay_payment_id, signature: r.razorpay_signature } });
            toast.success("Payment received — your plan is active.");
            onDone();
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Verification failed.");
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on("payment.failed", (r) => {
        setErr(r.error?.description ?? "Payment failed. Please try again.");
        setBusy(false);
      });
      rz.open();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
      setBusy(false);
    }
  };

  const go = async () => {
    setErr(null);
    if (!free) {
      if (txn.trim().length < 4)
        return setErr("Enter the transaction / reference ID from your payment app.");
      if (!file) return setErr("Upload your payment screenshot.");
    }
    setBusy(true);
    try {
      let proofPath: string | null = null;
      if (file) {
        const { data: u } = await supabase.auth.getUser();
        if (!u.user) throw new Error("Please sign in again.");
        const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-60);
        proofPath = `${u.user.id}/${Date.now()}-${safe}`;
        const up = await supabase.storage
          .from("subscription-proofs")
          .upload(proofPath, file, { contentType: file.type, upsert: false });
        if (up.error)
          throw new Error("Couldn't upload the screenshot. Check your connection and try again.");
      }
      await submit({
        data: {
          planCode: plan.code as "RENTDESK" | "RENTALOS_MANAGEMENT",
          transactionReference: txn,
          claimedAmount: payable,
          proofPath,
          note: note || undefined,
        },
      });
      toast.success("Submitted. The team will review your payment shortly.");
      onDone();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Upgrade to ${plan.name}`}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-card border border-border p-5 space-y-4">
        <div>
          <h2 className="font-semibold text-lg">Upgrade to {plan.name}</h2>
          <p className="text-sm text-muted-foreground">
            {free
              ? "Your discount covers the full price — no payment needed."
              : `Pay ₹${payable} by UPI, then share the proof below.`}
          </p>
        </div>

        {!free && gw.data?.enabled && (
          <div className="rounded-xl border border-primary/40 bg-primary/5 p-4 space-y-2">
            <button
              onClick={payOnline}
              disabled={busy}
              className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-3 text-sm font-semibold disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Pay ₹{payable} instantly (UPI / Card / NetBanking)
            </button>
            <p className="text-[11px] text-muted-foreground text-center">
              Your plan activates automatically the moment payment succeeds. No screenshot or waiting.
            </p>
            <p className="text-[11px] text-muted-foreground text-center">Or pay by QR below and submit proof for manual review.</p>
          </div>
        )}

        {!free && (
          <div className="rounded-xl border border-border p-4 text-center space-y-2">
            {info.qrUrl ? (
              <img
                src={info.qrUrl}
                alt="Payment QR code"
                className="mx-auto size-48 object-contain rounded-lg bg-white"
              />
            ) : null}
            {info.upiId && (
              <div className="text-sm">
                UPI ID: <b className="select-all">{info.upiId}</b>
              </div>
            )}
            {info.payeeName && (
              <div className="text-xs text-muted-foreground">Payee: {info.payeeName}</div>
            )}
            {!qrReady && (
              <div className="text-sm text-destructive">
                Payment details aren't set up yet. Please contact support.
              </div>
            )}
            <div className="text-2xl font-semibold">₹{payable}</div>
            {info.instructions && (
              <p className="text-xs text-muted-foreground">{info.instructions}</p>
            )}
          </div>
        )}

        {!free && (
          <>
            <label className="block text-sm">
              Transaction / reference ID
              <input
                value={txn}
                onChange={(e) => setTxn(e.target.value)}
                maxLength={64}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
                placeholder="e.g. 412345678901"
              />
            </label>
            <label className="block text-sm">
              Payment screenshot
              <div className="mt-1 flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-3">
                <Upload className="size-4 text-muted-foreground" />
                <input
                  type="file"
                  accept={PROOF_TYPES.join(",")}
                  onChange={(e) => pick(e.target.files?.[0] ?? null)}
                  className="text-xs w-full"
                />
              </div>
              {file && <span className="text-xs text-muted-foreground">{file.name}</span>}
            </label>
          </>
        )}
        <label className="block text-sm">
          Note (optional)
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2"
          />
        </label>

        {err && (
          <div
            role="alert"
            className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2"
          >
            {err}
          </div>
        )}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-border px-4 py-2 text-sm"
          >
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy || (!free && !qrReady)}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2"
          >
            {busy && <Loader2 className="size-4 animate-spin" />}{" "}
            {free ? "Activate request" : "Submit for review"}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          QR payments start after our team approves the proof. Online payments activate instantly.
        </p>
      </div>
    </div>
  );
}
