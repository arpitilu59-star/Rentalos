import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatDate, type MeterReading, type Room } from "@/lib/db";
import { ArrowLeft, AlertTriangle, TrendingUp, Activity, CheckCircle2, Download } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line } from "recharts";
import { BillHistoryFilters, useBillFilter, type BillFilterState } from "@/components/BillHistoryFilters";
import { downloadBillPdf } from "@/lib/pdf";

export const Route = createFileRoute("/_authenticated/rooms_/$roomId/analysis")({
  component: AnalysisPage,
});


type Anomaly = { type: "spike" | "drop" | "stuck" | "rollback"; month: string; detail: string };

function median(nums: number[]) {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function AnalysisPage() {
  const { roomId } = Route.useParams();
  const [room, setRoom] = useState<Room | null>(null);
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [bills, setBills] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [billFilter, setBillFilter] = useState<BillFilterState>({ year: "all", month: "all", status: "all" });
  const filteredBills = useBillFilter(bills, billFilter);

  useEffect(() => {
    (async () => {
      const [{ data: r }, { data: m }, { data: b }, { data: p }] = await Promise.all([
        supabase.from("rooms").select("*").eq("id", roomId).maybeSingle(),
        supabase.from("meter_readings").select("*").eq("room_id", roomId).order("reading_date"),
        supabase.from("bills").select("*, tenants(name, phone, email)").eq("room_id", roomId).order("rent_period_start", { ascending: false }),
        supabase.from("profiles").select("*").maybeSingle(),
      ]);
      setRoom((r as Room) ?? null);
      setReadings((m ?? []) as MeterReading[]);
      setBills(b ?? []);
      setProfile(p ?? null);
    })();
  }, [roomId]);


  // Group readings by month (latest reading in each month) and compute consumption between months
  const monthly = useMemo(() => {
    const byMonth = new Map<string, MeterReading>();
    for (const r of readings) {
      const key = r.reading_date.slice(0, 7); // YYYY-MM
      const existing = byMonth.get(key);
      if (!existing || r.reading_date > existing.reading_date) byMonth.set(key, r);
    }
    const sorted = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
    return sorted.map(([month, r], i, arr) => {
      const prev = i > 0 ? arr[i - 1][1] : null;
      const units = prev ? Math.max(0, Number(r.reading) - Number(prev.reading)) : 0;
      const raw = prev ? Number(r.reading) - Number(prev.reading) : 0;
      const monthLabel = new Date(month + "-01").toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      return { month, monthLabel, reading: Number(r.reading), units, raw };
    });
  }, [readings]);

  const anomalies: Anomaly[] = useMemo(() => {
    const out: Anomaly[] = [];
    if (monthly.length < 2) return out;
    const recent = monthly.slice(1); // first month has no consumption
    const med = median(recent.map((m) => m.units).filter((u) => u > 0));
    for (let i = 1; i < monthly.length; i++) {
      const m = monthly[i];
      if (m.raw < 0) out.push({ type: "rollback", month: m.monthLabel, detail: `Reading went backwards (${monthly[i - 1].reading} → ${m.reading}). Meter reset or wrong entry.` });
      else if (m.units === 0 && monthly[i - 1].reading > 0) out.push({ type: "stuck", month: m.monthLabel, detail: "Zero consumption — meter may be stuck or disconnected." });
      else if (med > 0 && m.units > med * 3) out.push({ type: "spike", month: m.monthLabel, detail: `${m.units} units — ${Math.round(m.units / med)}x the typical ${Math.round(med)} units.` });
      else if (med > 0 && m.units < med * 0.2 && m.units > 0) out.push({ type: "drop", month: m.monthLabel, detail: `${m.units} units — unusually low vs typical ${Math.round(med)}.` });
    }
    return out;
  }, [monthly]);

  const totalUnits = monthly.reduce((s, m) => s + m.units, 0);
  const avgUnits = monthly.length > 1 ? Math.round(totalUnits / (monthly.length - 1)) : 0;
  const lastUnits = monthly.length ? monthly[monthly.length - 1].units : 0;

  return (
    <AppShell>
      <Link to="/meters" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="size-4" /> Back to meters
      </Link>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Room {room?.room_number ?? "—"} · Meter Analysis</h1>
          <p className="text-muted-foreground mt-1">Monthly consumption trends and faulty-meter alerts.</p>
        </div>
      </div>

      {anomalies.length > 0 ? (
        <div className="mb-5 rounded-2xl border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-destructive font-semibold mb-2">
            <AlertTriangle className="size-4" /> {anomalies.length} possible meter issue{anomalies.length > 1 ? "s" : ""}
          </div>
          <ul className="text-sm space-y-1.5">
            {anomalies.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-medium text-destructive shrink-0">{a.month}:</span>
                <span className="text-foreground">{a.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : monthly.length > 1 ? (
        <div className="mb-5 rounded-2xl border border-success/30 bg-success/5 p-4 flex items-center gap-2 text-success font-medium text-sm">
          <CheckCircle2 className="size-4" /> Meter behaviour normal — no anomalies detected.
        </div>
      ) : null}

      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Stat label="Total months tracked" value={String(Math.max(0, monthly.length - 1))} icon={<Activity className="size-4" />} />
        <Stat label="Average / month" value={`${avgUnits} units`} icon={<TrendingUp className="size-4" />} />
        <Stat label="Last month" value={`${lastUnits} units`} icon={<Activity className="size-4" />} />
      </div>

      <Card title="Monthly consumption (units)">
        {monthly.length < 2 ? <Empty msg="Need at least 2 months of readings." /> : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={monthly.slice(1)}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="monthLabel" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Bar dataKey="units" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="h-3" />

      <Card title="Cumulative meter reading">
        {monthly.length < 2 ? <Empty msg="Need at least 2 readings." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="monthLabel" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Line type="monotone" dataKey="reading" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      <div className="h-3" />

      <Card title="All readings">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="py-2">Date</th><th>Reading</th><th>Units used</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {readings.map((r, i) => {
                const prev = readings[i - 1];
                const u = prev ? Number(r.reading) - Number(prev.reading) : 0;
                return (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="py-2">{formatDate(r.reading_date)}</td>
                    <td className="font-medium">{Number(r.reading).toLocaleString()}</td>
                    <td className={u < 0 ? "text-destructive font-medium" : ""}>{i === 0 ? "—" : u}</td>
                    <td className="text-xs text-muted-foreground">{r.ai_detected ? "AI" : "Manual"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {readings.length === 0 && <Empty msg="No readings yet." />}
        </div>
      </Card>

      <div className="mt-4">
        <Card title="Bill history">
          <BillHistoryFilters bills={bills} value={billFilter} onChange={setBillFilter} />
          {!bills.length ? <Empty msg="No bills for this room yet." />
          : !filteredBills.length ? <Empty msg="No bills match the filter." />
          : (
            <div className="space-y-2">
              {filteredBills.map((b: any) => {
                const due = Number(b.total_amount ?? 0) - Number(b.amount_paid ?? 0);
                const forPdf: any = { ...b, rooms: room ? { room_number: room.room_number } : null, tenants: b.tenants ?? null };
                return (
                  <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-border p-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium">{new Date(b.rent_period_start).toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</div>
                      <div className="text-[11px] text-muted-foreground">{b.tenants?.name ?? "—"} · Total ₹{Number(b.total_amount).toLocaleString("en-IN")} · Paid ₹{Number(b.amount_paid).toLocaleString("en-IN")}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${b.status === "paid" ? "bg-success text-success-foreground" : due > 0 ? "bg-warning text-warning-foreground" : "bg-muted text-muted-foreground"}`}>{b.status}</span>
                      <button onClick={() => downloadBillPdf(forPdf, profile)} className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border border-border hover:bg-accent">
                        <Download className="size-3" /> PDF
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </AppShell>
  );
}


function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="text-sm font-semibold mb-3">{title}</div>
      {children}
    </div>
  );
}
function Stat({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-center justify-between text-muted-foreground text-xs">{label}{icon}</div>
      <div className="text-2xl font-semibold mt-1">{value}</div>
    </div>
  );
}
function Empty({ msg }: { msg: string }) {
  return <div className="text-sm text-muted-foreground py-6 text-center">{msg}</div>;
}
