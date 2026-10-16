/* eslint-disable @typescript-eslint/no-explicit-any -- admin tables render loosely-typed joined rows */
import { getGatewayStatus } from "@/lib/subscription.functions";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import {
  adminApplySubscriptionAction,
  adminDecidePayment,
  adminGetPlanConfig,
  adminGetUserSubscription,
  adminListPayments,
  adminPaymentProofUrl,
  adminRevokeDiscount,
  adminRevokeOverride,
  adminSearchUsers,
  adminSetDiscount,
  adminSetOverride,
  adminSubscriptionOverview,
  adminUpdatePlan,
  adminUpdateSettings,
  adminUploadQr,
} from "@/lib/admin-subscriptions.functions";

export const Route = createFileRoute("/admin/subscriptions")({ component: SubscriptionsAdmin });

const TABS = ["Overview", "Payments", "Users", "Plans & payment settings"] as const;
type Tab = (typeof TABS)[number];
const inp = "w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm";
const btn =
  "rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50";
const btnP =
  "rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-sm disabled:opacity-50";
const fmt = (d?: string | null) =>
  d ? new Date(d).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function SubscriptionsAdmin() {
  const [tab, setTab] = useState<Tab>("Overview");
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Subscriptions</h1>
        <p className="text-sm text-muted-foreground">
          Payments, plan access, discounts and overrides. Every change is logged with who, when and
          why.
        </p>
      </div>
      <div className="flex gap-1 flex-wrap border-b border-border">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm -mb-px border-b-2 ${tab === t ? "border-primary font-medium" : "border-transparent text-muted-foreground"}`}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "Overview" && (
        <Overview goPayments={() => setTab("Payments")} goSettings={() => setTab("Plans & payment settings")} />
      )}
      {tab === "Payments" && <Payments />}
      {tab === "Users" && <UsersTab />}
      {tab === "Plans & payment settings" && <PlansTab />}
    </div>
  );
}

function Err({ e }: { e: unknown }) {
  return (
    <p className="text-sm text-destructive" role="alert">
      {e instanceof Error ? e.message : "Something went wrong."}
    </p>
  );
}

function Overview({ goPayments, goSettings }: { goPayments: () => void; goSettings: () => void }) {
  const fn = useServerFn(adminSubscriptionOverview);
  const q = useQuery({ queryKey: ["admin-sub-overview"], queryFn: () => fn(), retry: false });
  const planCfg = useServerFn(adminGetPlanConfig);
  const cfg = useQuery({ queryKey: ["admin-plan-config"], queryFn: () => planCfg(), retry: false });
  const gwFn = useServerFn(getGatewayStatus);
  const gw = useQuery({ queryKey: ["gateway-status"], queryFn: () => gwFn(), retry: false });
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data) return <Err e={q.error} />;
  const d = q.data;
  const cards: [string, number | string, boolean?][] = [
    ["Pending payments", d.pendingPayments, d.pendingPayments > 0],
    ["Active subscribers", d.active],
    ["Expiring in 7 days", d.expiringSoon, d.expiringSoon > 0],
    ["Expired", d.expired],
    ["Suspended", d.suspended],
    ["Free users", d.free],
    ["Approved this month", `₹${d.revenueThisMonth.toLocaleString("en-IN")}`],
  ];
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(([l, v, hot]) => (
          <div
            key={l}
            className={`rounded-xl border p-3 ${hot ? "border-amber-500/50 bg-amber-500/10" : "border-border bg-card"}`}
          >
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-medium">Payment setup</h2>
        <div className="grid sm:grid-cols-3 gap-3 text-sm">
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Payment QR (manual review)</div>
            {cfg.data?.qrUrl ? (
              <img src={cfg.data.qrUrl} alt="Current payment QR" className="mt-2 size-24 object-contain rounded bg-white" />
            ) : (
              <div className="mt-1 text-amber-600">{cfg.isLoading ? "Checking…" : "Not uploaded"}</div>
            )}
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">UPI ID</div>
            <div className="mt-1 font-medium">{cfg.data?.settings?.upi_id || (cfg.isLoading ? "…" : "Not set")}</div>
          </div>
          <div className="rounded-lg border border-border p-3">
            <div className="text-xs text-muted-foreground">Instant online payment (auto-activation)</div>
            <div className={`mt-1 font-medium ${gw.data?.enabled ? "text-emerald-600" : "text-amber-600"}`}>
              {gw.isLoading ? "…" : gw.data?.enabled ? "On — plans activate automatically" : "Off — add Razorpay keys"}
            </div>
          </div>
        </div>
        <button className={btnP} onClick={goSettings}>
          {cfg.data?.qrUrl ? "Change QR / payment settings" : "Upload payment QR"}
        </button>
        {!gw.data?.enabled && !gw.isLoading && (
          <p className="text-xs text-muted-foreground">
            QR payments are approved by you after checking the proof. For automatic activation (money straight to your
            account, plan active instantly) set RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET and RAZORPAY_WEBHOOK_SECRET in Vercel.
          </p>
        )}
      </section>
      {d.pendingPayments > 0 && (
        <button className={btnP} onClick={goPayments}>
          Review {d.pendingPayments} pending payment(s)
        </button>
      )}
      <div className="text-sm text-muted-foreground">
        Active by plan:{" "}
        {Object.entries(d.planCounts)
          .map(([k, v]) => `${k}: ${v}`)
          .join(" · ") || "none"}
      </div>
      <div>
        <h2 className="font-medium mb-2">Recent admin actions</h2>
        <div className="rounded-xl border border-border divide-y divide-border bg-card text-sm">
          {d.recentActions.length === 0 && (
            <div className="p-3 text-muted-foreground">Nothing yet.</div>
          )}
          {d.recentActions.map(
            (a: {
              id: string;
              action: string;
              created_at: string;
              metadata: { reason?: string; target_user_id?: string } | null;
            }) => (
              <div key={a.id} className="p-3 flex flex-wrap gap-x-4 gap-y-1">
                <b>{a.action.replaceAll("_", " ")}</b>
                <span className="text-muted-foreground">{fmt(a.created_at)}</span>
                {a.metadata?.target_user_id && (
                  <span className="text-xs text-muted-foreground">
                    user {a.metadata.target_user_id.slice(0, 8)}
                  </span>
                )}
                {a.metadata?.reason && <span>— {a.metadata.reason}</span>}
              </div>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function Payments() {
  const qc = useQueryClient();
  const list = useServerFn(adminListPayments);
  const proof = useServerFn(adminPaymentProofUrl);
  const decide = useServerFn(adminDecidePayment);
  const [status, setStatus] = useState<"PENDING_REVIEW" | "APPROVED" | "REJECTED" | "ALL">(
    "PENDING_REVIEW",
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const q = useQuery({
    queryKey: ["admin-sub-payments", status],
    queryFn: () => list({ data: { status } }),
    retry: false,
  });
  const m = useMutation({
    mutationFn: (v: { paymentId: string; decision: "APPROVED" | "REJECTED" | "CLARIFICATION" }) =>
      decide({ data: { ...v, note: notes[v.paymentId] || undefined } }),
    onSuccess: (_r, v) => {
      toast.success(
        v.decision === "APPROVED"
          ? "Approved — plan activated."
          : v.decision === "REJECTED"
            ? "Rejected."
            : "Clarification requested.",
      );
      qc.invalidateQueries({ queryKey: ["admin-sub-payments"] });
      qc.invalidateQueries({ queryKey: ["admin-sub-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const open = async (id: string) => {
    try {
      window.open((await proof({ data: { paymentId: id } })).url, "_blank", "noopener");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't open proof.");
    }
  };
  return (
    <div className="space-y-3">
      <select
        className={inp + " max-w-xs"}
        value={status}
        onChange={(e) => setStatus(e.target.value as typeof status)}
      >
        <option value="PENDING_REVIEW">Pending review</option>
        <option value="APPROVED">Approved</option>
        <option value="REJECTED">Rejected</option>
        <option value="ALL">All</option>
      </select>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      {q.isError && <Err e={q.error} />}
      {q.data?.length === 0 && <p className="text-sm text-muted-foreground">No payments here.</p>}
      {q.data?.map((p: Record<string, any>) => (
        <div key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-2 text-sm">
          <div className="flex flex-wrap gap-x-4 gap-y-1 items-center">
            <b>{p.profile?.full_name ?? "Unknown user"}</b>
            <span className="text-muted-foreground">
              {p.profile?.email ?? ""} {p.profile?.phone ?? ""}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
              {p.status.replace("_", " ").toLowerCase()}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            <span>
              Plan: <b>{p.subscription_plans?.name}</b>
            </span>
            <span>
              Expected: <b>₹{Number(p.amount)}</b>
              {Number(p.discount_amount) > 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  (list ₹{Number(p.original_amount)}, discount ₹{Number(p.discount_amount)})
                </span>
              )}
            </span>
            <span
              className={
                p.claimed_amount != null && Number(p.claimed_amount) !== Number(p.amount)
                  ? "text-destructive"
                  : ""
              }
            >
              User says paid: ₹{p.claimed_amount ?? "—"}
            </span>
            <span>
              Ref: <b className="select-all">{p.transaction_reference ?? "—"}</b>
            </span>
            <span className="text-muted-foreground">{fmt(p.submitted_at)}</span>
          </div>
          {p.note && <div className="text-muted-foreground">User note: {p.note}</div>}
          {p.admin_note && <div className="text-muted-foreground">Admin note: {p.admin_note}</div>}
          <div className="flex flex-wrap gap-2 items-center">
            {p.payment_proof_path && (
              <button className={btn} onClick={() => open(p.id)}>
                <ExternalLink className="size-3.5 inline mr-1" />
                View proof
              </button>
            )}
            {p.status === "PENDING_REVIEW" && (
              <>
                <input
                  className={inp + " max-w-xs"}
                  placeholder="Note (required to reject / ask)"
                  value={notes[p.id] ?? ""}
                  onChange={(e) => setNotes((n) => ({ ...n, [p.id]: e.target.value }))}
                />
                <button
                  className={btnP}
                  disabled={m.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Approve ₹${Number(p.amount)} for ${p.subscription_plans?.name}? This activates the plan.`,
                      )
                    )
                      m.mutate({ paymentId: p.id, decision: "APPROVED" });
                  }}
                >
                  Approve
                </button>
                <button
                  className={btn}
                  disabled={m.isPending}
                  onClick={() => m.mutate({ paymentId: p.id, decision: "CLARIFICATION" })}
                >
                  Ask for details
                </button>
                <button
                  className={btn + " text-destructive"}
                  disabled={m.isPending}
                  onClick={() => m.mutate({ paymentId: p.id, decision: "REJECTED" })}
                >
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function UsersTab() {
  const search = useServerFn(adminSearchUsers);
  const [term, setTerm] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState("");
  const q = useQuery({
    queryKey: ["admin-sub-users", submitted],
    queryFn: () => search({ data: { q: submitted } }),
    enabled: submitted.length >= 2,
    retry: false,
  });
  return (
    <div className="space-y-3">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(term.trim());
          setSel(null);
        }}
      >
        <input
          className={inp}
          placeholder="Search name, email, phone or user ID"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button className={btnP} disabled={term.trim().length < 2}>
          Search
        </button>
      </form>
      {q.isLoading && <Loader2 className="size-5 animate-spin" />}
      {q.isError && <Err e={q.error} />}
      {!sel &&
        q.data?.map((u: Record<string, any>) => (
          <button
            key={u.id}
            onClick={() => setSel(u.id)}
            className="w-full text-left rounded-lg border border-border bg-card p-3 text-sm hover:bg-accent"
          >
            <b>{u.full_name ?? "(no name)"}</b>{" "}
            <span className="text-muted-foreground">
              {u.email} {u.phone ?? u.mobile ?? ""}
            </span>
            <span className="ml-2 text-xs rounded-full bg-muted px-2 py-0.5">
              {u.subscription
                ? `${u.subscription.subscription_plans?.code} · ${u.subscription.status}`
                : "FREE"}
            </span>
          </button>
        ))}
      {sel && <UserDetail userId={sel} onBack={() => setSel(null)} />}
    </div>
  );
}

function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(adminGetUserSubscription);
  const act = useServerFn(adminApplySubscriptionAction);
  const setDisc = useServerFn(adminSetDiscount);
  const revDisc = useServerFn(adminRevokeDiscount);
  const setOv = useServerFn(adminSetOverride);
  const revOv = useServerFn(adminRevokeOverride);
  const q = useQuery({
    queryKey: ["admin-sub-user", userId],
    queryFn: () => get({ data: { userId } }),
    retry: false,
  });
  const planCfg = useServerFn(adminGetPlanConfig);
  const cfg = useQuery({ queryKey: ["admin-plan-config"], queryFn: () => planCfg(), retry: false });
  const [reason, setReason] = useState("");
  const [planCode, setPlanCode] = useState<"FREE" | "RENTDESK" | "RENTALOS_MANAGEMENT">("RENTDESK");
  const [months, setMonths] = useState("1");
  const [dKind, setDKind] = useState<"fixed" | "percent" | "free">("percent");
  const [dVal, setDVal] = useState("10");
  const [dMonths, setDMonths] = useState("1");
  const [dPlan, setDPlan] = useState<"RENTDESK" | "RENTALOS_MANAGEMENT">("RENTDESK");
  const [oFeat, setOFeat] = useState("");
  const [oOn, setOOn] = useState(true);
  const [oExp, setOExp] = useState("");

  const done = (msg: string) => () => {
    toast.success(msg);
    setReason("");
    qc.invalidateQueries({ queryKey: ["admin-sub-user", userId] });
    qc.invalidateQueries({ queryKey: ["admin-sub-overview"] });
  };
  const fail = (e: Error) => toast.error(e.message);
  const need = () => {
    if (reason.trim().length < 3) {
      toast.error("Enter a reason first (it is saved in the audit log).");
      return false;
    }
    return true;
  };
  const mAct = useMutation({
    mutationFn: (v: {
      action: "assign" | "extend" | "reduce" | "cancel" | "suspend" | "reactivate";
      planCode?: typeof planCode;
      months?: number | null;
    }) => act({ data: { userId, reason, ...v } }),
    onSuccess: done("Done."),
    onError: fail,
  });
  const mDisc = useMutation({
    mutationFn: () =>
      setDisc({
        data: {
          userId,
          planCode: dPlan,
          kind: dKind,
          value: dKind === "free" ? null : Number(dVal),
          months: Number(dMonths) || 1,
          reason,
        },
      }),
    onSuccess: done("Discount saved."),
    onError: fail,
  });
  const mRevD = useMutation({
    mutationFn: (id: string) => revDisc({ data: { discountId: id, reason } }),
    onSuccess: done("Discount removed."),
    onError: fail,
  });
  const mOv = useMutation({
    mutationFn: () =>
      setOv({
        data: {
          userId,
          feature: oFeat,
          enabled: oOn,
          expiresAt: oExp ? new Date(oExp).toISOString() : null,
          reason,
        },
      }),
    onSuccess: done("Override saved."),
    onError: fail,
  });
  const mRevO = useMutation({
    mutationFn: (id: string) => revOv({ data: { overrideId: id, reason } }),
    onSuccess: done("Override removed."),
    onError: fail,
  });

  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data) return <Err e={q.error} />;
  const d = q.data;
  const features = (
    (cfg.data?.features ?? []) as { feature_key: string; label: string; kind: string }[]
  ).filter((f) => f.kind === "feature");
  return (
    <div className="space-y-4 text-sm">
      <button className={btn} onClick={onBack}>
        ← Back to results
      </button>
      <div className="rounded-xl border border-border bg-card p-4 space-y-1">
        <div className="text-base font-semibold">{d.profile.full_name ?? "(no name)"}</div>
        <div className="text-muted-foreground">
          {d.profile.email} {d.profile.phone ?? d.profile.mobile ?? ""} ·{" "}
          {d.profile.primary_role ?? "—"} · <span className="select-all">{d.profile.id}</span>
        </div>
        <div>
          Effective plan: <b>{d.entitlements.plan_code}</b> · status <b>{d.entitlements.status}</b>{" "}
          · expires {fmt(d.entitlements.expires_at)} · source {d.entitlements.source ?? "—"}
        </div>
        <div>
          Usage: {d.usage.properties} properties / limit{" "}
          {d.entitlements.limits.max_properties ?? "∞"} · {d.usage.rooms} rooms / limit{" "}
          {d.entitlements.limits.max_rooms ?? "∞"}
        </div>
        <div className="text-xs text-muted-foreground">
          Enabled:{" "}
          {Object.entries(d.entitlements.features)
            .filter(([, v]) => v)
            .map(([k]) => k)
            .join(", ") || "none"}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <label className="block">
          Reason (required, saved in audit log)
          <input
            className={inp}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Verified bank transfer / goodwill / abuse report"
          />
        </label>
        <div className="flex flex-wrap gap-2 items-end">
          <select
            className={inp + " max-w-[200px]"}
            value={planCode}
            onChange={(e) => setPlanCode(e.target.value as typeof planCode)}
          >
            <option value="FREE">Free (free access)</option>
            <option value="RENTDESK">RentDesk</option>
            <option value="RENTALOS_MANAGEMENT">Rentalos Management</option>
          </select>
          <input
            className={inp + " max-w-[110px]"}
            value={months}
            onChange={(e) => setMonths(e.target.value)}
            inputMode="numeric"
            aria-label="Months"
            placeholder="months"
          />
          <button
            className={btnP}
            disabled={mAct.isPending}
            onClick={() =>
              need() &&
              mAct.mutate({
                action: "assign",
                planCode,
                months: planCode === "FREE" ? null : months.trim() === "" ? null : Number(months),
              })
            }
          >
            Assign plan {months.trim() === "" ? "(until revoked)" : ""}
          </button>
          <button
            className={btn}
            disabled={mAct.isPending}
            onClick={() => need() && mAct.mutate({ action: "extend", months: Number(months) })}
          >
            Extend
          </button>
          <button
            className={btn}
            disabled={mAct.isPending}
            onClick={() => need() && mAct.mutate({ action: "reduce", months: Number(months) })}
          >
            Reduce
          </button>
          <button
            className={btn}
            disabled={mAct.isPending}
            onClick={() =>
              need() && mAct.mutate({ action: "reactivate", months: Number(months) || null })
            }
          >
            Reactivate
          </button>
          <button
            className={btn}
            disabled={mAct.isPending}
            onClick={() =>
              need() &&
              confirm("Suspend this user's paid access?") &&
              mAct.mutate({ action: "suspend" })
            }
          >
            Suspend
          </button>
          <button
            className={btn + " text-destructive"}
            disabled={mAct.isPending}
            onClick={() =>
              need() &&
              confirm("Cancel this subscription? Data stays, access becomes read-only.") &&
              mAct.mutate({ action: "cancel" })
            }
          >
            Cancel
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Leave months empty on "Assign" for access until you revoke it.
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-medium">Discounts</h3>
          {d.discounts.map((x: Record<string, any>) => (
            <div key={x.id} className="flex justify-between gap-2 border-b border-border pb-1">
              <span>
                {x.subscription_plans?.code}:{" "}
                {x.kind === "free" ? "free" : x.kind === "percent" ? `${x.value}%` : `₹${x.value}`}{" "}
                · {x.periods_used}/{x.duration_months} used {x.active ? "" : "(inactive)"}
              </span>
              {x.active && (
                <button className="text-xs underline" onClick={() => need() && mRevD.mutate(x.id)}>
                  remove
                </button>
              )}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <select
              className={inp + " max-w-[150px]"}
              value={dPlan}
              onChange={(e) => setDPlan(e.target.value as typeof dPlan)}
            >
              <option value="RENTDESK">RentDesk</option>
              <option value="RENTALOS_MANAGEMENT">Management</option>
            </select>
            <select
              className={inp + " max-w-[110px]"}
              value={dKind}
              onChange={(e) => setDKind(e.target.value as typeof dKind)}
            >
              <option value="percent">% off</option>
              <option value="fixed">₹ off</option>
              <option value="free">Free</option>
            </select>
            {dKind !== "free" && (
              <input
                className={inp + " max-w-[80px]"}
                value={dVal}
                onChange={(e) => setDVal(e.target.value)}
                aria-label="Value"
              />
            )}
            <input
              className={inp + " max-w-[90px]"}
              value={dMonths}
              onChange={(e) => setDMonths(e.target.value)}
              aria-label="Months it applies"
              title="Number of billing periods"
            />
            <button
              className={btnP}
              disabled={mDisc.isPending}
              onClick={() => need() && mDisc.mutate()}
            >
              Add discount
            </button>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-4 space-y-2">
          <h3 className="font-medium">Feature overrides</h3>
          {d.overrides
            .filter((x: Record<string, any>) => !x.revoked_at)
            .map((x: Record<string, any>) => (
              <div key={x.id} className="flex justify-between gap-2 border-b border-border pb-1">
                <span>
                  {x.feature_key}: <b>{x.enabled ? "ON" : "OFF"}</b> · until{" "}
                  {x.expires_at ? fmt(x.expires_at) : "revoked"}
                </span>
                <button className="text-xs underline" onClick={() => need() && mRevO.mutate(x.id)}>
                  remove
                </button>
              </div>
            ))}
          <div className="flex flex-wrap gap-2">
            <select
              className={inp + " max-w-[200px]"}
              value={oFeat}
              onChange={(e) => setOFeat(e.target.value)}
            >
              <option value="">Feature…</option>
              {features.map((f) => (
                <option key={f.feature_key} value={f.feature_key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select
              className={inp + " max-w-[90px]"}
              value={oOn ? "on" : "off"}
              onChange={(e) => setOOn(e.target.value === "on")}
            >
              <option value="on">Enable</option>
              <option value="off">Disable</option>
            </select>
            <input
              type="date"
              className={inp + " max-w-[150px]"}
              value={oExp}
              onChange={(e) => setOExp(e.target.value)}
              aria-label="Expires on (optional)"
            />
            <button
              className={btnP}
              disabled={!oFeat || mOv.isPending}
              onClick={() => need() && mOv.mutate()}
            >
              Save override
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <h3 className="font-medium mb-2">History</h3>
        {d.audit.map((a: Record<string, any>) => (
          <div key={a.id} className="border-b border-border py-1">
            <b>{a.action.replaceAll("_", " ")}</b> · {fmt(a.created_at)} · by{" "}
            {String(a.admin_user_id).slice(0, 8)}{" "}
            {a.metadata?.reason ? `— ${a.metadata.reason}` : ""}
          </div>
        ))}
        {d.audit.length === 0 && (
          <span className="text-muted-foreground">No admin actions yet.</span>
        )}
      </div>
    </div>
  );
}

function PlansTab() {
  const qc = useQueryClient();
  const planCfg = useServerFn(adminGetPlanConfig);
  const q = useQuery({ queryKey: ["admin-plan-config"], queryFn: () => planCfg(), retry: false });
  const upd = useServerFn(adminUpdatePlan);
  const sett = useServerFn(adminUpdateSettings);
  const qr = useServerFn(adminUploadQr);
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState<Record<string, string>>({});
  const [form, setForm] = useState<{
    upi?: string;
    payee?: string;
    instr?: string;
    grace?: string;
  }>({});
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-plan-config"] });
  const mPlan = useMutation({
    mutationFn: (v: {
      planId: string;
      priceInr?: number;
      entitlements?: { featureKey: string; enabled: boolean; limitValue?: number | null }[];
      reason: string;
    }) => upd({ data: v }),
    onSuccess: () => {
      toast.success("Plan updated.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const mSet = useMutation({
    mutationFn: () =>
      sett({
        data: {
          ...(form.upi !== undefined ? { upiId: form.upi } : {}),
          ...(form.payee !== undefined ? { payeeName: form.payee } : {}),
          ...(form.instr !== undefined ? { instructions: form.instr } : {}),
          ...(form.grace !== undefined ? { graceDays: Number(form.grace) } : {}),
        },
      }),
    onSuccess: () => {
      toast.success("Settings saved.");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [qrBusy, setQrBusy] = useState(false);
  const upQr = async (f: File | null) => {
    if (!f) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(f.type) || f.size > 2 * 1024 * 1024)
      return toast.error("Use a PNG/JPG/WebP image under 2 MB.");
    const b64 = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result).split(",")[1] ?? "");
      r.onerror = () => rej(new Error("read"));
      r.readAsDataURL(f);
    });
    setQrBusy(true);
    try {
      await qr({ data: { base64: b64, mime: f.type as "image/png" } });
      toast.success("QR updated.");
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setQrBusy(false);
    }
  };
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data) return <Err e={q.error} />;
  const d = q.data;
  const s = d.settings;
  return (
    <div className="space-y-6 text-sm">
      <section className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-medium">Payment QR & UPI</h2>
        {d.qrUrl ? (
          <img
            src={d.qrUrl}
            alt="Current payment QR"
            className="size-40 object-contain rounded bg-white"
          />
        ) : (
          <p className="text-amber-600">No QR uploaded yet. Users can't pay until you add one.</p>
        )}
        <label className={`${btnP} inline-flex items-center gap-2 cursor-pointer ${qrBusy ? "opacity-50 pointer-events-none" : ""}`}>
          {qrBusy ? "Uploading…" : d.qrUrl ? "Replace QR image" : "Upload QR image"}
          <input
            type="file"
            className="sr-only"
            accept="image/png,image/jpeg,image/webp"
            disabled={qrBusy}
            onChange={(e) => {
              const input = e.currentTarget;
              void upQr(input.files?.[0] ?? null).finally(() => {
                input.value = "";
              });
            }}
          />
        </label>
        <p className="text-xs text-muted-foreground">PNG / JPG / WebP, up to 2 MB.</p>
        <div className="grid md:grid-cols-2 gap-2">
          <label>
            UPI ID
            <input
              className={inp}
              defaultValue={s?.upi_id ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, upi: e.target.value }))}
            />
          </label>
          <label>
            Payee name
            <input
              className={inp}
              defaultValue={s?.payee_name ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
            />
          </label>
          <label className="md:col-span-2">
            Instructions shown to users
            <textarea
              className={inp}
              rows={2}
              defaultValue={s?.instructions ?? ""}
              onChange={(e) => setForm((f) => ({ ...f, instr: e.target.value }))}
            />
          </label>
          <label>
            Grace days after expiry (0 = none)
            <input
              className={inp}
              inputMode="numeric"
              defaultValue={s?.grace_days ?? 0}
              onChange={(e) => setForm((f) => ({ ...f, grace: e.target.value }))}
            />
          </label>
        </div>
        <button className={btnP} disabled={mSet.isPending} onClick={() => mSet.mutate()}>
          Save settings
        </button>
      </section>

      <section className="space-y-3">
        <h2 className="font-medium">
          Plans (exactly three; features come from this matrix everywhere)
        </h2>
        <label className="block max-w-md">
          Reason for plan changes (saved in audit log)
          <input className={inp} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
        {(d.plans as Record<string, any>[]).map((p) => (
          <div key={p.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
            <div className="flex flex-wrap items-center gap-3">
              <b>{p.name}</b>
              <span className="text-xs text-muted-foreground">{p.code}</span>
              {p.code !== "FREE" && (
                <>
                  ₹
                  <input
                    className={inp + " max-w-[90px]"}
                    value={price[p.id] ?? String(Number(p.price_inr))}
                    onChange={(e) => setPrice((x) => ({ ...x, [p.id]: e.target.value }))}
                  />
                  <button
                    className={btn}
                    disabled={mPlan.isPending || reason.trim().length < 3}
                    onClick={() =>
                      mPlan.mutate({
                        planId: p.id,
                        priceInr: Number(price[p.id] ?? p.price_inr),
                        reason,
                      })
                    }
                  >
                    Save price
                  </button>
                </>
              )}
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1">
              {(d.features as Record<string, any>[]).map((f) => {
                const e = (d.entitlements as Record<string, any>[]).find(
                  (x) => x.plan_id === p.id && x.feature_key === f.feature_key,
                );
                return f.kind === "limit" ? (
                  <label key={f.feature_key} className="flex items-center gap-2">
                    {f.label}:
                    <input
                      className={inp + " max-w-[80px]"}
                      defaultValue={e?.limit_value ?? ""}
                      placeholder="∞"
                      onBlur={(ev) => {
                        const v = ev.target.value.trim();
                        if (reason.trim().length < 3) return toast.error("Enter a reason first.");
                        mPlan.mutate({
                          planId: p.id,
                          entitlements: [
                            {
                              featureKey: f.feature_key,
                              enabled: true,
                              limitValue: v === "" ? null : Number(v),
                            },
                          ],
                          reason,
                        });
                      }}
                    />
                  </label>
                ) : (
                  <label key={f.feature_key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!e?.enabled}
                      disabled={mPlan.isPending}
                      onChange={(ev) =>
                        reason.trim().length < 3
                          ? toast.error("Enter a reason first.")
                          : mPlan.mutate({
                              planId: p.id,
                              entitlements: [
                                { featureKey: f.feature_key, enabled: ev.target.checked },
                              ],
                              reason,
                            })
                      }
                    />
                    {f.label}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
