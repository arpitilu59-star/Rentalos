import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import {
  anniversaryRange, formatDate, formatINR, getOwnerId, getSettings, nextMonthRange, prevMonthRange, toISODate, upiPayUrl, upiQrUrl,
  type Bill, type MeterReading, type Profile, type Room, type Settings, type Tenant,
} from "@/lib/db";
import { downloadBillPdf } from "@/lib/pdf";
import { uploadBillPdfPublic } from "@/lib/bill-share";
import { sendWhatsApp } from "@/lib/whatsapp.functions";
import { sendEmail } from "@/lib/email.functions";
import { buildReceiptHtml } from "@/lib/receipt";
import { Plus, MessageCircle, CheckCircle2, X, Trash2, Wallet, Copy, FileDown, Send, BellOff, IndianRupee, Mail } from "lucide-react";
import { BillHistoryFilters, useBillFilter, type BillFilterState } from "@/components/BillHistoryFilters";

export const Route = createFileRoute("/_authenticated/bills")({ component: BillsPage });

type BillRow = Bill & { rooms: { room_number: string } | null; tenants: { name: string; phone: string; email: string | null; move_in_date: string } | null };

function BillsPage() {
  const [bills, setBills] = useState<BillRow[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "partial" | "dues">("all");
  const [ymFilter, setYmFilter] = useState<BillFilterState>({ year: "all", month: "all", status: "all" });
  const [showForm, setShowForm] = useState(false);
  const [payFor, setPayFor] = useState<BillRow | null>(null);

  const load = async () => {
    const [{ data: b }, { data: r }, { data: t }, { data: m }, { data: p }, s] = await Promise.all([
      supabase.from("bills").select("*, rooms(room_number), tenants(name, phone, email, move_in_date)").order("created_at", { ascending: false }),
      supabase.from("rooms").select("*").order("room_number"),
      supabase.from("tenants").select("*").eq("active", true),
      supabase.from("meter_readings").select("*").order("reading_date", { ascending: false }),
      supabase.from("profiles").select("*").maybeSingle(),
      getSettings().catch(() => null),
    ]);
    setBills((b ?? []) as BillRow[]); setRooms((r ?? []) as Room[]); setTenants((t ?? []) as Tenant[]);
    setReadings((m ?? []) as MeterReading[]); setProfile((p ?? null) as Profile | null); setSettings(s);
  };
  useEffect(() => { load(); }, []);

  const sendReceiptFn = useServerFn(sendEmail);
  const sendReceipt = async (b: BillRow, paidAmount: number) => {
    if (!b.tenants?.email) return { sent: false, reason: "no-email" as const };
    try {
      const html = buildReceiptHtml({
        invoiceId: b.id,
        tenantName: b.tenants.name,
        roomNumber: b.rooms?.room_number ?? "-",
        amount: paidAmount,
        paymentDate: new Date(),
        businessName: profile?.business_name || profile?.full_name || "RentDesk",
      });
      await sendReceiptFn({ data: {
        to: b.tenants.email,
        fromName: profile?.business_name || profile?.full_name || "RentDesk",
        subject: "Payment Receipt",
        html,
      }});
      await supabase.from("bills").update({ receipt_sent_at: new Date().toISOString() }).eq("id", b.id);
      return { sent: true as const };
    } catch (e) {
      return { sent: false as const, reason: "error" as const, error: (e as Error).message };
    }
  };

  const markPaid = async (b: BillRow) => {
    const total = Number(b.total_amount);
    await supabase.from("bills").update({ status: "paid", amount_paid: total, paid_at: new Date().toISOString() }).eq("id", b.id);
    const r = await sendReceipt(b, total);
    if (r.sent) alert("Marked paid. Receipt emailed to tenant ✓");
    else if (r.reason === "no-email") alert("Marked paid. (Tenant has no email — add it to send receipt automatically.)");
    else alert("Marked paid. Receipt email failed: " + r.error);
    load();
  };
  const markPending = async (b: BillRow) => {
    await supabase.from("bills").update({ status: "pending", amount_paid: 0, paid_at: null }).eq("id", b.id);
    load();
  };
  const pauseReminders = async (b: BillRow) => {
    const dStr = prompt("Stop reminders until (YYYY-MM-DD)?", toISODate(new Date(Date.now() + 14 * 86400000)));
    if (!dStr) return;
    await supabase.from("bills").update({ reminders_paused_until: dStr }).eq("id", b.id);
    load();
  };
  const remove = async (id: string) => { if (!confirm("Delete bill?")) return; await supabase.from("bills").delete().eq("id", id); load(); };

  const statusFiltered = bills.filter((b) =>
    filter === "all" ? true
    : filter === "dues" ? (b.status !== "paid" && Number(b.previous_dues) > 0)
    : b.status === filter
  );
  const filtered = useBillFilter(statusFiltered, ymFilter);
  const totalDues = bills.filter((b) => b.status !== "paid").reduce((s, b) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0);

  return (
    <AppShell>
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Bills</h1>
          <p className="text-muted-foreground mt-1">Generate bills, accept payments & track dues.</p>
        </div>
        <button onClick={() => setShowForm(true)} disabled={rooms.length === 0 || !settings} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium disabled:opacity-50">
          <Plus className="size-4" /> Generate bill
        </button>
      </div>

      {totalDues > 0 && (
        <div className="mb-4 rounded-2xl bg-destructive/10 border border-destructive/30 p-4 flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-wide text-destructive font-medium">Total Outstanding</div>
            <div className="text-2xl font-semibold text-destructive">{formatINR(totalDues)}</div>
          </div>
          <button onClick={() => setFilter("dues")} className="text-xs text-destructive font-medium hover:underline">View dues</button>
        </div>
      )}

      <div className="flex gap-2 mb-2 overflow-x-auto">
        {(["all", "pending", "partial", "paid", "dues"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${filter === f ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
            {f === "dues" ? "Has dues" : f}
          </button>
        ))}
      </div>
      <BillHistoryFilters bills={bills} value={ymFilter} onChange={setYmFilter} hideStatus />


      <div className="space-y-3">
        {filtered.map((b) => (
          <BillCard key={b.id} bill={b} profile={profile}
            onMarkPaid={() => markPaid(b)} onMarkPending={() => markPending(b)}
            onRecordPayment={() => setPayFor(b)} onPauseReminders={() => pauseReminders(b)}
            onDelete={() => remove(b.id)} onChanged={load} />
        ))}
        {filtered.length === 0 && <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">No bills here.</div>}
      </div>

      {showForm && settings && <GenerateBillForm rooms={rooms} tenants={tenants} readings={readings} settings={settings} onClose={() => setShowForm(false)} onSaved={() => { setShowForm(false); load(); }} />}
      {payFor && <RecordPaymentForm bill={payFor} profile={profile} onClose={() => setPayFor(null)} onSaved={() => { setPayFor(null); load(); }} />}
    </AppShell>
  );
}

function BillCard({ bill, profile, onMarkPaid, onMarkPending, onRecordPayment, onPauseReminders, onDelete, onChanged }: {
  bill: BillRow; profile: Profile | null;
  onMarkPaid: () => void; onMarkPending: () => void; onRecordPayment: () => void; onPauseReminders: () => void; onDelete: () => void; onChanged: () => void;
}) {
  const balance = Number(bill.total_amount) - Number(bill.amount_paid);
  const upi = upiPayUrl(profile?.upi_id, profile?.business_name || profile?.full_name, balance, `Rent Room ${bill.rooms?.room_number}`);
  const qr = upiQrUrl(profile?.upi_id, profile?.business_name || profile?.full_name, balance, `Rent Room ${bill.rooms?.room_number}`);
  const message = buildWhatsAppMessage(bill, profile, upi);
  const phone = bill.tenants?.phone?.replace(/\D/g, "") ?? "";
  const waUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const sendFn = useServerFn(sendWhatsApp);
  const [sending, setSending] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const sendTwilio = async () => {
    if (!profile?.whatsapp_from) { alert("Profile → 'WhatsApp sender number' set karo (Twilio sandbox: +14155238886)."); return; }
    if (!phone) { alert("Tenant phone missing."); return; }
    setSending(true);
    try {
      // Upload PDF to public storage so Twilio can fetch it as media attachment.
      let mediaUrl: string | undefined;
      try {
        mediaUrl = await uploadBillPdfPublic(bill, profile);
      } catch (e) {
        console.warn("PDF attach skipped:", e);
      }
      await sendFn({ data: {
        to: phone.startsWith("+") ? phone : `+${phone}`,
        from: profile.whatsapp_from,
        body: message,
        ...(mediaUrl ? { mediaUrl } : {}),
      } });
      await supabase.from("bills").update({ whatsapp_sent_at: new Date().toISOString(), last_reminded_at: new Date().toISOString() }).eq("id", bill.id);
      alert(mediaUrl ? "WhatsApp message + PDF sent ✓" : "WhatsApp message sent (PDF attach failed) ✓");
      onChanged();
    } catch (e) {
      const err = e as Error;
      alert("Send failed: " + err.message + "\n\nTip: Sandbox me tenant ne pehle 'join <code>' bheja hona chahiye.");
    } finally { setSending(false); }
  };

  const statusBadge = bill.status === "paid" ? "bg-success/15 text-success"
    : bill.status === "partial" ? "bg-warning/20 text-warning-foreground"
    : "bg-warning/20 text-warning-foreground";

  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold">Room {bill.rooms?.room_number}</span>
            <span className="text-xs text-muted-foreground">· {bill.tenants?.name ?? "—"}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">Due {formatDate(bill.due_date)}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-semibold">{formatINR(balance)}</div>
          <div className="text-[10px] text-muted-foreground">of {formatINR(Number(bill.total_amount))}</div>
          <span className={`inline-block mt-0.5 text-[10px] px-2 py-0.5 rounded-full ${statusBadge}`}>{bill.status}</span>
        </div>
      </div>

      <div className="mt-3 grid sm:grid-cols-3 gap-2 text-xs">
        <Line label="Rent" value={formatINR(Number(bill.rent_amount))} />
        <Line label={`Elec (${bill.units_consumed}u)`} value={formatINR(Number(bill.electricity_amount))} />
        <Line label="Water" value={formatINR(Number(bill.water_amount))} />
        <Line label="Cleaning" value={formatINR(Number(bill.cleaning_amount))} />
        {Number(bill.other_charges) > 0 && <Line label={bill.other_charges_note || "Other"} value={formatINR(Number(bill.other_charges))} />}
        {Number(bill.previous_dues) > 0 && <Line label="Previous dues" value={formatINR(Number(bill.previous_dues))} />}
        {Number(bill.amount_paid) > 0 && <Line label="Paid" value={formatINR(Number(bill.amount_paid))} />}
      </div>

      {bill.reminders_paused_until && (
        <div className="mt-2 text-[11px] text-muted-foreground inline-flex items-center gap-1"><BellOff className="size-3" /> Reminders paused till {formatDate(bill.reminders_paused_until)}</div>
      )}
      {bill.receipt_sent_at && (
        <div className="mt-1 text-[11px] text-success inline-flex items-center gap-1"><Mail className="size-3" /> Receipt emailed {formatDate(bill.receipt_sent_at)}</div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <a href={phone ? waUrl : undefined} target="_blank" rel="noreferrer"
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${phone ? "bg-success text-success-foreground hover:opacity-95" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          onClick={(e) => { if (!phone) e.preventDefault(); }}>
          <MessageCircle className="size-3" /> WhatsApp (manual)
        </a>
        <button onClick={sendTwilio} disabled={sending} className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-60">
          <Send className="size-3" /> {sending ? "Sending…" : "Auto-send"}
        </button>
        <button onClick={() => { void downloadBillPdf(bill, profile); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
          <FileDown className="size-3" /> PDF
        </button>
        <button onClick={() => setShowPay((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
          <Wallet className="size-3" /> Pay UPI
        </button>
        {bill.status !== "paid" && (
          <button onClick={onRecordPayment} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
            <IndianRupee className="size-3" /> Record payment
          </button>
        )}
        <button onClick={bill.status === "paid" ? onMarkPending : onMarkPaid} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent">
          <CheckCircle2 className="size-3" /> Mark {bill.status === "paid" ? "pending" : "fully paid"}
        </button>
        {bill.status !== "paid" && (
          <button onClick={onPauseReminders} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent" title="Pause reminders">
            <BellOff className="size-3" />
          </button>
        )}
        <button onClick={() => { navigator.clipboard.writeText(message); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-accent" title="Copy bill text">
          <Copy className="size-3" />
        </button>
        <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs hover:bg-destructive/10 hover:text-destructive ml-auto">
          <Trash2 className="size-3" />
        </button>
      </div>

      {showPay && profile?.upi_id && (
        <div className="mt-3 rounded-xl border border-border p-3 bg-muted/30 flex flex-col sm:flex-row gap-3 items-center">
          {qr && <img src={qr} alt="UPI QR" className="size-32 rounded-lg bg-white p-1" />}
          <div className="flex-1 text-xs space-y-1.5 w-full">
            <div className="text-muted-foreground">Pay <span className="font-semibold text-foreground">{formatINR(balance)}</span> to</div>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-2 py-1.5 rounded bg-background border border-border">{profile.upi_id}</code>
              <button onClick={() => { navigator.clipboard.writeText(profile.upi_id!); alert("UPI ID copied"); }} className="rounded border border-border px-2 py-1.5 hover:bg-accent"><Copy className="size-3" /></button>
            </div>
            {upi && (
              <button
                type="button"
                onClick={() => {
                  // Force navigation to upi:// scheme. Works on Android/iOS UPI apps.
                  try { window.location.href = upi; } catch { /* ignore */ }
                  setTimeout(() => {
                    // Fallback hint when no UPI app handles the scheme (desktop browsers).
                    if (document.visibilityState === "visible") {
                      navigator.clipboard?.writeText(upi).catch(() => {});
                      alert("Koi UPI app installed nahi mili. Link copy ho gaya — phone pe paste karo, ya QR scan karo.");
                    }
                  }, 1200);
                }}
                className="block w-full text-center bg-primary text-primary-foreground rounded-lg py-2 font-medium"
              >
                Open UPI app
              </button>
            )}
            <p className="text-[10px] text-muted-foreground">Mobile pe UPI app khulega. Desktop pe QR scan karo.</p>
          </div>
        </div>
      )}
      {showPay && !profile?.upi_id && (
        <div className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
          Profile → UPI ID set karo to enable.
        </div>
      )}
    </div>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return <div className="flex justify-between rounded-lg bg-muted/40 px-2.5 py-1.5"><span className="text-muted-foreground truncate pr-2">{label}</span><span className="font-medium whitespace-nowrap">{value}</span></div>;
}

function buildWhatsAppMessage(b: BillRow, profile: Profile | null, upi: string | null) {
  const from = profile?.business_name || profile?.full_name || "";
  const balance = Number(b.total_amount) - Number(b.amount_paid);
  const paySection = profile?.upi_id
    ? `\n💳 Pay online:\nUPI: ${profile.upi_id}${upi ? `\nQuick pay: ${upi}` : ""}`
    : profile?.bank_details ? `\n💳 Bank details:\n${profile.bank_details}` : "";
  return (
`Hello ${b.tenants?.name ?? ""},

🏠 Room: ${b.rooms?.room_number ?? ""}

📅 Rent: ${formatDate(b.rent_period_start)} – ${formatDate(b.rent_period_end)}
${formatINR(Number(b.rent_amount))}

⚡ Electricity${b.elec_period_start ? ` (${formatDate(b.elec_period_start)} – ${formatDate(b.elec_period_end!)})` : ""}
Prev: ${b.prev_reading} | Curr: ${b.curr_reading} | Units: ${b.units_consumed}
${formatINR(Number(b.electricity_amount))}

💧 Water: ${formatINR(Number(b.water_amount))}
🧹 Cleaning: ${formatINR(Number(b.cleaning_amount))}
${Number(b.previous_dues) > 0 ? `📌 Previous dues: ${formatINR(Number(b.previous_dues))}\n` : ""}
💰 Total: ${formatINR(Number(b.total_amount))}${Number(b.amount_paid) > 0 ? `\n✅ Paid: ${formatINR(Number(b.amount_paid))}\n🔴 Balance: ${formatINR(balance)}` : ""}

📆 Due: ${formatDate(b.due_date)}${paySection}

Thank you${from ? `,\n${from}` : "."}`
  );
}

function RecordPaymentForm({ bill, profile, onClose, onSaved }: { bill: BillRow; profile: Profile | null; onClose: () => void; onSaved: () => void }) {
  const balance = Number(bill.total_amount) - Number(bill.amount_paid);
  const [amount, setAmount] = useState(balance.toString());
  const [method, setMethod] = useState("UPI");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const sendReceiptFn = useServerFn(sendEmail);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const owner_id = await getOwnerId();
    const amt = Number(amount);
    await supabase.from("payments").insert({ owner_id, bill_id: bill.id, amount: amt, method, note: note || null });
    const newPaid = Number(bill.amount_paid) + amt;
    const status = newPaid >= Number(bill.total_amount) ? "paid" : "partial";
    await supabase.from("bills").update({
      amount_paid: newPaid, status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    }).eq("id", bill.id);

    // Auto-email receipt only when bill becomes fully paid + tenant has email.
    if (status === "paid" && bill.tenants?.email) {
      try {
        const html = buildReceiptHtml({
          invoiceId: bill.id,
          tenantName: bill.tenants.name,
          roomNumber: bill.rooms?.room_number ?? "-",
          amount: newPaid,
          paymentDate: new Date(),
          businessName: profile?.business_name || profile?.full_name || "RentDesk",
        });
        await sendReceiptFn({ data: {
          to: bill.tenants.email,
          fromName: profile?.business_name || profile?.full_name || "RentDesk",
          subject: "Payment Receipt",
          html,
        }});
        await supabase.from("bills").update({ receipt_sent_at: new Date().toISOString() }).eq("id", bill.id);
      } catch (err) {
        console.warn("Receipt email failed:", err);
      }
    }
    setSaving(false); onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">Record payment</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="text-xs text-muted-foreground">Balance: <span className="font-semibold text-foreground">{formatINR(balance)}</span></div>
          <Field label="Amount received"><input required type="number" min="1" max={balance} value={amount} onChange={(e) => setAmount(e.target.value)} className={input} /></Field>
          <Field label="Method">
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={input}>
              <option>UPI</option><option>Cash</option><option>Bank transfer</option><option>Other</option>
            </select>
          </Field>
          <Field label="Note (optional)"><input value={note} onChange={(e) => setNote(e.target.value)} className={input} placeholder="UTR / ref" /></Field>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GenerateBillForm({ rooms, tenants, readings, settings, onClose, onSaved }: { rooms: Room[]; tenants: Tenant[]; readings: MeterReading[]; settings: Settings; onClose: () => void; onSaved: () => void }) {
  const [room_id, setRoom] = useState(rooms[0]?.id ?? "");
  const roomTenants = tenants.filter((t) => t.room_id === room_id);
  const [tenant_id, setTenant] = useState<string>(roomTenants[0]?.id ?? "");
  const room = rooms.find((r) => r.id === room_id);
  const tenant = tenants.find((t) => t.id === tenant_id);
  const roomReadings = readings.filter((r) => r.room_id === room_id);
  const latest = roomReadings[0]; const prev = roomReadings[1];

  // Anniversary-based defaults
  const range = tenant?.move_in_date
    ? anniversaryRange(tenant.move_in_date)
    : (() => { const n = nextMonthRange(); const p = prevMonthRange(); return { rentStart: n.start, rentEnd: n.end, elecStart: p.start, elecEnd: p.end }; })();

  const [rentStart, setRentStart] = useState(toISODate(range.rentStart));
  const [rentEnd, setRentEnd] = useState(toISODate(range.rentEnd));
  const [elecStart, setElecStart] = useState(toISODate(range.elecStart));
  const [elecEnd, setElecEnd] = useState(toISODate(range.elecEnd));
  const [prev_reading, setPrev] = useState(prev?.reading?.toString() ?? tenant?.initial_reading?.toString() ?? "0");
  const [curr_reading, setCurr] = useState(latest?.reading?.toString() ?? "0");
  const [rent_amount, setRentAmt] = useState(room?.rent_amount?.toString() ?? "0");
  const [persons, setPersons] = useState(roomTenants.reduce((s, t) => s + t.persons, 0).toString() || "1");
  const [due_date, setDue] = useState(toISODate(new Date(range.rentStart.getFullYear(), range.rentStart.getMonth(), range.rentStart.getDate() + 5)));
  const [previous_dues, setDues] = useState("0");
  const [other_charges, setOther] = useState("0");
  const [other_charges_note, setOtherNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      let q = supabase.from("bills").select("total_amount,amount_paid").neq("status", "paid").eq("room_id", room_id);
      if (tenant_id) q = q.eq("tenant_id", tenant_id);
      const { data } = await q;
      const sum = (data ?? []).reduce((s: number, b: { total_amount: number; amount_paid: number }) => s + (Number(b.total_amount) - Number(b.amount_paid)), 0);
      setDues(sum.toString());
    })();
  }, [room_id, tenant_id]);

  useEffect(() => {
    setTenant(roomTenants[0]?.id ?? "");
    setRentAmt(room?.rent_amount?.toString() ?? "0");
    setPersons(roomTenants.reduce((s, t) => s + t.persons, 0).toString() || "1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room_id]);

  useEffect(() => {
    // Re-anchor dates and prev reading whenever tenant changes
    const t = tenants.find((x) => x.id === tenant_id);
    if (t?.move_in_date) {
      const r = anniversaryRange(t.move_in_date);
      setRentStart(toISODate(r.rentStart)); setRentEnd(toISODate(r.rentEnd));
      setElecStart(toISODate(r.elecStart)); setElecEnd(toISODate(r.elecEnd));
      setDue(toISODate(new Date(r.rentStart.getFullYear(), r.rentStart.getMonth(), r.rentStart.getDate() + 5)));
    }
    const seedPrev = prev?.reading ?? t?.initial_reading ?? 0;
    setPrev(String(seedPrev));
    setCurr(latest?.reading?.toString() ?? String(seedPrev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant_id]);

  const units = Math.max(0, Number(curr_reading) - Number(prev_reading));
  const electricity_amount = units * Number(settings.electricity_per_unit);
  const water_per_person_rate = room?.water_per_person != null ? Number(room.water_per_person) : Number(settings.water_per_person);
  const water_amount = Number(persons) * water_per_person_rate;
  const cleaning_amount = room?.cleaning_amount != null ? Number(room.cleaning_amount) : Number(settings.cleaning_amount);
  const total_amount = Number(rent_amount) + electricity_amount + water_amount + cleaning_amount + Number(other_charges || 0) + Number(previous_dues || 0);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const owner_id = await getOwnerId();
    await supabase.from("bills").insert({
      owner_id, room_id, tenant_id: tenant_id || null, rent_period_start: rentStart, rent_period_end: rentEnd, rent_amount: Number(rent_amount),
      elec_period_start: elecStart, elec_period_end: elecEnd, prev_reading: Number(prev_reading), curr_reading: Number(curr_reading),
      units_consumed: units, electricity_amount, persons: Number(persons), water_amount, cleaning_amount,
      other_charges: Number(other_charges || 0), other_charges_note: other_charges_note || null,
      previous_dues: Number(previous_dues || 0),
      total_amount, due_date, status: "pending", amount_paid: 0,
    });
    setSaving(false); onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-lg shadow-elevated">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold">Generate bill</h3>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-accent"><X className="size-4" /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3 max-h-[85vh] overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Room">
              <select value={room_id} onChange={(e) => setRoom(e.target.value)} className={input}>
                {rooms.map((r) => <option key={r.id} value={r.id}>Room {r.room_number}</option>)}
              </select>
            </Field>
            <Field label="Tenant">
              <select value={tenant_id} onChange={(e) => setTenant(e.target.value)} className={input}>
                <option value="">(none)</option>
                {roomTenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
          {tenant?.move_in_date && (
            <div className="text-[11px] text-muted-foreground">Dates auto-set from move-in day ({new Date(tenant.move_in_date).getDate()}). Edit if needed.</div>
          )}

          <div className="rounded-xl bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Advance Rent</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={rentStart} onChange={(e) => setRentStart(e.target.value)} className={input} />
              <input type="date" value={rentEnd} onChange={(e) => setRentEnd(e.target.value)} className={input} />
            </div>
            <input type="number" min="0" value={rent_amount} onChange={(e) => setRentAmt(e.target.value)} className={input} placeholder="Rent ₹" />
          </div>

          <div className="rounded-xl bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Electricity (previous period)</div>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={elecStart} onChange={(e) => setElecStart(e.target.value)} className={input} />
              <input type="date" value={elecEnd} onChange={(e) => setElecEnd(e.target.value)} className={input} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-muted-foreground">Prev reading
                <input type="number" value={prev_reading} onChange={(e) => setPrev(e.target.value)} className={input + " mt-1"} />
              </label>
              <label className="text-xs text-muted-foreground">Current reading
                <input type="number" value={curr_reading} onChange={(e) => setCurr(e.target.value)} className={input + " mt-1"} />
              </label>
            </div>
            <div className="text-xs text-muted-foreground">Units: <span className="font-semibold text-foreground">{units}</span> × ₹{settings.electricity_per_unit} = <span className="font-semibold text-foreground">{formatINR(electricity_amount)}</span></div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Total persons"><input type="number" min="1" value={persons} onChange={(e) => setPersons(e.target.value)} className={input} /></Field>
            <Field label="Due date"><input type="date" value={due_date} onChange={(e) => setDue(e.target.value)} className={input} /></Field>
          </div>

          <Field label="Previous dues (unpaid balance)">
            <input type="number" min="0" value={previous_dues} onChange={(e) => setDues(e.target.value)} className={input} />
            <span className="text-[10px] text-muted-foreground mt-1 block">Auto-filled from unpaid balances.</span>
          </Field>

          <div className="rounded-xl bg-muted/40 p-3 space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Other charges (parking, maintenance, damage, etc.)</div>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <input value={other_charges_note} onChange={(e) => setOtherNote(e.target.value)} placeholder="Description (optional)" className={input} />
              <input type="number" min="0" value={other_charges} onChange={(e) => setOther(e.target.value)} placeholder="₹ 0" className={input} />
            </div>
          </div>

          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-sm space-y-1">
            <Row k="Rent" v={formatINR(Number(rent_amount))} />
            <Row k="Electricity" v={formatINR(electricity_amount)} />
            <Row k={`Water (${persons} × ₹${water_per_person_rate})`} v={formatINR(water_amount)} />
            <Row k="Cleaning" v={formatINR(cleaning_amount)} />
            {Number(other_charges) > 0 && <Row k={other_charges_note || "Other"} v={formatINR(Number(other_charges))} />}
            {Number(previous_dues) > 0 && <Row k="Previous dues" v={formatINR(Number(previous_dues))} />}
            <div className="border-t border-border pt-1.5 mt-1.5 flex justify-between font-semibold"><span>Total</span><span>{formatINR(total_amount)}</span></div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save bill"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) { return <div className="flex justify-between"><span className="text-muted-foreground">{k}</span><span className="font-medium">{v}</span></div>; }
const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
