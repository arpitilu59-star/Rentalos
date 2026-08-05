import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { listPendingPayments, verifyPayment, signPaymentProof } from "@/lib/payments.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check, X, Image as ImageIcon, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payment-verify")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const list = useServerFn(listPendingPayments);
  const verify = useServerFn(verifyPayment);
  const sign = useServerFn(signPaymentProof);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["pending-payments"], queryFn: () => list() });
  const [busy, setBusy] = useState<string | null>(null);
  const [imgUrl, setImgUrl] = useState<string | null>(null);

  useEffect(() => {
    const ch = supabase.channel("payments-verify")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, () => {
        qc.invalidateQueries({ queryKey: ["pending-payments"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const act = async (id: string, decision: "verify" | "reject") => {
    if (decision === "reject" && !confirm("Reject this payment proof?")) return;
    setBusy(id);
    try {
      await verify({ data: { payment_id: id, decision } });
      qc.invalidateQueries({ queryKey: ["pending-payments"] });
    } catch (e) { alert((e as Error).message); }
    setBusy(null);
  };

  const view = async (path: string) => {
    const { url } = await sign({ data: { path } });
    setImgUrl(url);
  };

  return (
    <AppShell>
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-6 text-primary" />
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Verify payment proofs</h1>
      </div>
      <p className="text-muted-foreground mt-1">Tenants ne UPI se pay karke screenshot bheji hain — verify karein.</p>

      {isLoading ? (
        <div className="mt-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : !data?.payments?.length ? (
        <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Koi pending payment proof nahi.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {data.payments.map((p: any) => (
            <div key={p.id} className="rounded-2xl bg-card border border-border p-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-medium">{p.bills?.tenants?.name ?? "Tenant"} · Room {p.bills?.rooms?.room_number ?? "-"}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5">
                    {p.bills?.tenants?.tenant_code && <span>Tenant ID: <span className="font-mono text-foreground">{p.bills.tenants.tenant_code}</span></span>}
                    {p.bills?.rooms?.id && <span>Room ID: <span className="font-mono">{String(p.bills.rooms.id).slice(0, 8)}</span></span>}
                    {p.bills?.tenants?.phone && <span>📱 {p.bills.tenants.phone}</span>}
                    {p.bills?.rooms?.properties?.name && <span>🏠 {p.bills.rooms.properties.name}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Amount: <span className="font-medium text-foreground">{inr(p.amount)}</span>
                    {p.upi_ref && <> · Ref: <span className="font-mono">{p.upi_ref}</span></>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{new Date(p.created_at).toLocaleString("en-IN")}</div>
                  {p.note && <div className="text-xs italic mt-1">"{p.note}"</div>}
                </div>
                <div className="flex gap-2">
                  {p.screenshot_path && (
                    <button onClick={() => view(p.screenshot_path)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent">
                      <ImageIcon className="size-3" /> View proof
                    </button>
                  )}
                  <button disabled={busy === p.id} onClick={() => act(p.id, "reject")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md border border-border hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /> Reject</button>
                  <button disabled={busy === p.id} onClick={() => act(p.id, "verify")} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-primary text-primary-foreground font-medium">
                    {busy === p.id ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />} Verify & apply
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {imgUrl && (
        <div className="fixed inset-0 z-50 bg-black/70 grid place-items-center p-4" onClick={() => setImgUrl(null)}>
          <img src={imgUrl} alt="proof" className="max-h-[90vh] max-w-full rounded-lg" />
        </div>
      )}
    </AppShell>
  );
}
