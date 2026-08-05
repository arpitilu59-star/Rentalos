import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { createDeposit, listDeposits, settleDeposit } from "@/lib/landlord-ops.functions";
import { formatINR } from "@/lib/db";
import { Wallet, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/deposits")({ component: DepositsPage });

function DepositsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listDeposits);
  const create = useServerFn(createDeposit);
  const settle = useServerFn(settleDeposit);

  const list = useQuery({ queryKey: ["deposits"], queryFn: () => fetchList() });

  const [tenantId, setTenantId] = useState("");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await create({ data: { tenant_id: tenantId, amount_held: Number(amount) } });
      setTenantId(""); setAmount("");
      qc.invalidateQueries({ queryKey: ["deposits"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const doSettle = async (id: string) => {
    const ded = Number(prompt("Deduction amount?") || "0");
    if (isNaN(ded) || ded < 0) return;
    const reason = ded > 0 ? prompt("Deduction reason?") || undefined : undefined;
    await settle({ data: { id, amount_deducted: ded, deduction_reason: reason } });
    qc.invalidateQueries({ queryKey: ["deposits"] });
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Wallet className="size-6 text-primary" /> Security deposits
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">Track deposits held and refund settlements.</p>
        </header>

        <form onSubmit={submit} className="rounded-2xl bg-card border border-border p-5 shadow-card space-y-3">
          <div className="font-semibold text-sm">Hold a new deposit</div>
          <input required value={tenantId} onChange={(e) => setTenantId(e.target.value)} placeholder="Tenant ID (UUID)" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm font-mono" />
          <input required type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₹" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button disabled={busy} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Save
          </button>
        </form>

        <div className="space-y-2">
          {list.isLoading ? <Loader2 className="size-5 animate-spin" /> :
            (list.data?.items ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No deposits yet.</p> :
            (list.data?.items ?? []).map((d: any) => (
              <div key={d.id} className="rounded-xl border border-border bg-card p-4 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{d.tenants?.name || "—"}</div>
                  <div className="text-xs text-muted-foreground">{d.tenants?.phone}</div>
                  <div className="text-xs mt-1">
                    Held: <b>{formatINR(Number(d.amount_held))}</b>
                    {Number(d.amount_deducted) > 0 && <> · Deducted: {formatINR(Number(d.amount_deducted))}</>}
                    {Number(d.amount_refunded) > 0 && <> · Refunded: {formatINR(Number(d.amount_refunded))}</>}
                  </div>
                  {d.deduction_reason && <div className="text-xs text-muted-foreground italic mt-0.5">Reason: {d.deduction_reason}</div>}
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${d.status === "refunded" ? "bg-emerald-500/10 text-emerald-600" : d.status === "forfeited" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}>{d.status.replace("_", " ")}</span>
                </div>
                {d.status === "held" && (
                  <button onClick={() => doSettle(d.id)} className="text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground">Settle</button>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </AppShell>
  );
}
