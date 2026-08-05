import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, type Bill, type Room, type Tenant } from "@/lib/db";
import { DoorOpen, Users, Wallet, CheckCircle2, Clock, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rentdesk")({ component: Dashboard });

type Stats = { totalRooms: number; occupied: number; empty: number; pendingAmount: number; paidAmount: number; monthIncome: number };

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bills, setBills] = useState<(Bill & { rooms: { room_number: string } | null; tenants: { name: string } | null })[]>([]);
  const [tenants, setTenants] = useState<(Tenant & { rooms: { room_number: string } | null })[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: rooms }, { data: tenantsRaw }, { data: billsRaw }] = await Promise.all([
        supabase.from("rooms").select("*"),
        supabase.from("tenants").select("*, rooms(room_number)").eq("active", true),
        supabase.from("bills").select("*, rooms(room_number), tenants(name)").order("created_at", { ascending: false }).limit(20),
      ]);
      const r = (rooms ?? []) as Room[];
      const t = (tenantsRaw ?? []) as (Tenant & { rooms: { room_number: string } | null })[];
      const b = (billsRaw ?? []) as (Bill & { rooms: { room_number: string } | null; tenants: { name: string } | null })[];
      const occupiedIds = new Set(t.map((x) => x.room_id));
      const now = new Date();
      const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const monthBills = b.filter((x) => x.rent_period_start?.startsWith(ym));
      const monthIncome = monthBills.reduce((s, x) => s + Number(x.amount_paid || 0), 0);
      const pendingAmount = b.filter((x) => x.status !== "paid").reduce((s, x) => s + (Number(x.total_amount) - Number(x.amount_paid || 0)), 0);
      const paidAmount = b.filter((x) => x.status === "paid").reduce((s, x) => s + Number(x.total_amount), 0);
      setStats({
        totalRooms: r.length,
        occupied: r.filter((x) => occupiedIds.has(x.id)).length,
        empty: r.filter((x) => !occupiedIds.has(x.id)).length,
        pendingAmount,
        paidAmount,
        monthIncome,
      });
      setBills(b);
      setTenants(t);
    })();
  }, []);

  const q = search.trim().toLowerCase();
  const filteredTenants = q
    ? tenants.filter((x) => x.name.toLowerCase().includes(q) || x.phone.includes(q) || (x.rooms?.room_number ?? "").toLowerCase().includes(q))
    : tenants;

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Namaste 👋</h1>
          <p className="text-sm text-muted-foreground">Aapke property ka quick overview.</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total rooms" value={String(stats?.totalRooms ?? "—")} icon={DoorOpen} />
          <StatCard label="Occupied" value={String(stats?.occupied ?? "—")} icon={Users} accent="text-success" />
          <StatCard label="Pending dues" value={formatINR(stats?.pendingAmount ?? 0)} icon={Clock} accent="text-warning" />
          <StatCard label="This month income" value={formatINR(stats?.monthIncome ?? 0)} icon={Wallet} accent="text-success" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl bg-card border border-border p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <div className="font-medium">Recent bills</div>
              <Link to="/bills" className="text-xs text-primary font-medium hover:underline">View all →</Link>
            </div>
            <ul className="divide-y divide-border text-sm">
              {bills.slice(0, 6).map((b) => (
                <li key={b.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{b.tenants?.name || "Tenant"} · Room {b.rooms?.room_number}</div>
                    <div className="text-xs text-muted-foreground">Due {b.due_date}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-semibold">{formatINR(Number(b.total_amount))}</div>
                    <div className={`text-[10px] uppercase tracking-wide ${b.status === "paid" ? "text-success" : "text-warning"}`}>{b.status}</div>
                  </div>
                </li>
              ))}
              {bills.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Abhi koi bills nahi.</li>}
            </ul>
          </div>

          <div className="rounded-2xl bg-card border border-border p-5 shadow-card">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div className="font-medium">Active tenants</div>
              <div className="relative">
                <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="pl-7 pr-2 py-1.5 text-xs rounded-md bg-background border border-input outline-none focus:ring-2 ring-ring/40 w-36" />
              </div>
            </div>
            <ul className="divide-y divide-border text-sm">
              {filteredTenants.slice(0, 6).map((t) => (
                <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{t.name}</div>
                    <div className="text-xs text-muted-foreground">Room {t.rooms?.room_number} · {t.phone}</div>
                  </div>
                  <CheckCircle2 className="size-4 text-success" />
                </li>
              ))}
              {filteredTenants.length === 0 && <li className="py-6 text-center text-xs text-muted-foreground">Koi tenant nahi mila.</li>}
            </ul>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, icon: Icon, accent }: { label: string; value: string; icon: React.ComponentType<{ className?: string }>; accent?: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><Icon className={`size-4 ${accent ?? "text-muted-foreground"}`} /></div>
      <div className="mt-2 text-xl md:text-2xl font-semibold">{value}</div>
    </div>
  );
}
