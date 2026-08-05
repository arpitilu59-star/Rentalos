import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { getTenantPayBill, submitPaymentProof } from "@/lib/payments.functions";
import { upiPayUrl, upiQrUrl } from "@/lib/db";
import { TenantShell } from "@/components/TenantShell";
import { BillHistoryFilters, useBillFilter, type BillFilterState } from "@/components/BillHistoryFilters";
import { downloadBillPdf } from "@/lib/pdf";
import { Loader2, Receipt, CreditCard, X, Copy, Check, Upload, ExternalLink, Download } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/rent")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/rent" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });
  const [payBill, setPayBill] = useState<any | null>(null);
  const [filter, setFilter] = useState<BillFilterState>({ year: "all", month: "all", status: "all" });
  const filtered = useBillFilter(data?.bills ?? [], filter);

  const download = async (b: any) => {
    const forPdf: any = {
      ...b,
      rooms: data?.room ? { room_number: data.room.room_number } : null,
      tenants: data?.tenant ? { name: data.tenant.name, phone: data.tenant.phone, email: data.tenant.email } : null,
    };
    await downloadBillPdf(forPdf, data?.landlord ?? null);
  };

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><Receipt className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Rent & Bills</h1></div>
      {isLoading ? <Loader /> : !data?.bills?.length ? <Empty msg="No bills yet." /> : (
        <>
          <BillHistoryFilters bills={data.bills} value={filter} onChange={setFilter} />
          {!filtered.length ? <Empty msg="No bills match the filter." /> : (
            <div className="space-y-2">
              {filtered.map((b: any) => {
                const due = (b.total_amount ?? 0) - (b.amount_paid ?? 0);
                return (
                  <div key={b.id} className="rounded-2xl bg-card border border-border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{new Date(b.rent_period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>
                        <div className="text-xs text-muted-foreground">Due {new Date(b.due_date).toLocaleDateString("en-IN")}</div>
                      </div>
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${b.status === "paid" ? "bg-success text-success-foreground" : due > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{b.status}</span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <Cell label="Rent" value={inr(b.rent_amount)} />
                      <Cell label="Electricity" value={inr(b.electricity_amount ?? 0)} />
                      <Cell label="Water" value={inr(b.water_amount ?? 0)} />
                      <Cell label="Other" value={inr(b.other_charges ?? 0)} />
                    </div>
                    <div className="mt-3 flex items-center justify-between border-t border-border pt-3 gap-2 flex-wrap">
                      <div className="text-xs text-muted-foreground">Paid {inr(b.amount_paid)}</div>
                      <div className="flex items-center gap-2">
                        <div className="text-base font-semibold">{inr(b.total_amount)} <span className={`text-xs font-normal ml-1 ${due > 0 ? "text-destructive" : "text-success"}`}>{due > 0 ? `· ${inr(due)} due` : "· Paid"}</span></div>
                        <button onClick={() => download(b)} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded-lg border border-border hover:bg-accent">
                          <Download className="size-3" /> PDF
                        </button>
                        {due > 0 && (
                          <button onClick={() => setPayBill(b)} className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-medium">
                            <CreditCard className="size-3" /> Pay
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
      {payBill && <PayModal bill={payBill} onClose={() => setPayBill(null)} />}
    </TenantShell>
  );
}


function PayModal({ bill, onClose }: { bill: any; onClose: () => void }) {
  const qc = useQueryClient();
  const load = useServerFn(getTenantPayBill);
  const submit = useServerFn(submitPaymentProof);
  const { data, isLoading, refetch } = useQuery({ queryKey: ["pay-bill", bill.id], queryFn: () => load({ data: { bill_id: bill.id } }) });

  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [qrShownAt, setQrShownAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!qrShownAt) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [qrShownAt]);

  const due = (bill.total_amount ?? 0) - (bill.amount_paid ?? 0);
  const landlord = data?.landlord;
  const upiId = landlord?.upi_id;
  const payeeName = landlord?.business_name || landlord?.full_name || "Landlord";
  const note = `Rent ${new Date(bill.rent_period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}`;
  const upiDeep = upiPayUrl(upiId, payeeName, due, note);
  const qrValid = qrShownAt !== null && now - qrShownAt < 5 * 60 * 1000;
  const qrUrl = qrValid ? upiQrUrl(upiId, payeeName, due, note) : null;
  const secondsLeft = qrValid ? Math.max(0, Math.ceil((5 * 60 * 1000 - (now - qrShownAt!)) / 1000)) : 0;
  const lastPayment = data?.payments?.[0];

  const copy = () => {
    if (!upiId) return;
    navigator.clipboard.writeText(upiId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const openApp = () => {
    if (!upiDeep) return;
    // On mobile browsers this triggers the UPI app chooser
    window.location.href = upiDeep;
  };

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      let b64: string | undefined; let mime: string | undefined;
      if (file) {
        const buf = await file.arrayBuffer();
        let s = ""; const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        b64 = btoa(s); mime = file.type || "image/jpeg";
      }
      await submit({ data: {
        bill_id: bill.id,
        amount: Number(amount) || due,
        upi_ref: ref || undefined,
        screenshot_base64: b64,
        screenshot_mime: mime,
      }});
      await refetch();
      qc.invalidateQueries({ queryKey: ["tenant-dash"] });
      setFile(null); setRef(""); setAmount("");
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md shadow-elevated max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border sticky top-0 bg-card">
          <div>
            <div className="font-semibold">Pay via UPI</div>
            <div className="text-xs text-muted-foreground">{note} · {inr(due)}</div>
          </div>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>

        <div className="p-5 space-y-4">
          {isLoading ? <Loader /> : !upiId ? (
            <div className="text-sm text-destructive bg-destructive/10 rounded-lg p-3">
              Landlord ne UPI ID set nahi ki hai. Landlord ko contact karein.
            </div>
          ) : (
            <>
              <div className="rounded-xl border border-border p-4 text-center">
                {qrUrl ? (
                  <>
                    <img src={qrUrl} alt="UPI QR" className="mx-auto rounded-lg" width={200} height={200} />
                    <div className="mt-2 text-xs text-warning">QR valid for {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}</div>
                  </>
                ) : (
                  <button onClick={() => setQrShownAt(Date.now())} className="w-full py-8 text-sm text-primary font-medium border-2 border-dashed border-border rounded-lg hover:bg-accent">
                    Generate QR code (valid 5 min)
                  </button>
                )}
                <div className="mt-3 text-xs text-muted-foreground">Scan with any UPI app</div>
                <div className="mt-2 inline-flex items-center gap-2 bg-muted rounded-lg px-3 py-1.5 text-sm">
                  <span className="font-mono">{upiId}</span>
                  <button onClick={copy} className="text-primary hover:opacity-70">{copied ? <Check className="size-4" /> : <Copy className="size-4" />}</button>
                </div>
                {qrShownAt !== null && !qrValid && (
                  <button onClick={() => setQrShownAt(Date.now())} className="mt-2 text-xs text-primary underline">Regenerate QR</button>
                )}
              </div>

              <button onClick={openApp} className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-medium">
                <ExternalLink className="size-4" /> Open UPI app · Pay {inr(due)}
              </button>

              <div className="border-t border-border pt-4">
                <div className="font-medium text-sm mb-2">After payment: submit proof</div>
                {lastPayment && (
                  <div className="text-xs mb-3 p-2 rounded-lg bg-muted">
                    Last submission: <span className="font-medium">{lastPayment.verification_status}</span> · {inr(lastPayment.amount)}
                  </div>
                )}
                <form onSubmit={upload} className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input type="number" placeholder={`Amount (${due})`} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} />
                    <input placeholder="UPI ref (optional)" value={ref} onChange={(e) => setRef(e.target.value)} className={input} />
                  </div>
                  <label className="block">
                    <div className="text-xs text-muted-foreground mb-1">Screenshot (optional)</div>
                    <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-xs" />
                  </label>
                  {err && <div className="text-xs text-destructive">{err}</div>}
                  <button disabled={busy} className="w-full inline-flex items-center justify-center gap-1 rounded-lg bg-secondary text-secondary-foreground px-3 py-2 text-sm font-medium disabled:opacity-60">
                    {busy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} Submit proof
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm";

function Cell({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-background border border-border px-2 py-1.5"><div className="text-[10px] uppercase text-muted-foreground">{label}</div><div className="font-medium">{value}</div></div>;
}
function Loader() { return <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>; }
function Empty({ msg }: { msg: string }) { return <div className="py-20 text-center text-sm text-muted-foreground">{msg}</div>; }
