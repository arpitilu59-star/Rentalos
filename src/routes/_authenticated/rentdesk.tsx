import { useServerFn } from "@tanstack/react-start";
import { getMyLandlordDashboard } from "@/lib/room-insights.functions";
import { RoomInsightsCard } from "@/components/RoomInsightsCard";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, type Bill, type Tenant } from "@/lib/db";
import { WhatsAppAutomationPanel } from "@/components/WhatsAppAutomationPanel";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { DoorOpen, Users, Wallet, CheckCircle2, Clock, Search, Receipt } from "lucide-react";

export const Route = createFileRoute("/_authenticated/rentdesk")({ component: Dashboard });

type Stats = {
  totalRooms: number;
  occupied: number;
  empty: number;
  pendingAmount: number;
  paidAmount: number;
  monthIncome: number;
  beds: number;
  filled: number;
  vacant: number;
  overdue: number;
  pendingPayments: number;
  pendingBookings: number;
};

function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [bills, setBills] = useState<
    (Bill & { rooms: { room_number: string } | null; tenants: { name: string } | null })[]
  >([]);
  const [tenants, setTenants] = useState<(Tenant & { rooms: { room_number: string } | null })[]>(
    [],
  );
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const dashboard = useServerFn(getMyLandlordDashboard);

  useEffect(() => {
    (async () => {
      const [totals, { data: tenantsRaw }, { data: billsRaw }] = await Promise.all([
        dashboard(),
        supabase.from("tenants").select("*, rooms(room_number)").eq("active", true),
        supabase
          .from("bills")
          .select("*, rooms(room_number), tenants(name)")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      const t = (tenantsRaw ?? []) as (Tenant & { rooms: { room_number: string } | null })[];
      const b = (billsRaw ?? []) as (Bill & {
        rooms: { room_number: string } | null;
        tenants: { name: string } | null;
      })[];
      setStats({
        totalRooms: totals.rooms,
        occupied: totals.occupied,
        empty: totals.rooms - totals.occupied,
        pendingAmount: totals.due,
        paidAmount: totals.paid,
        monthIncome: totals.collected,
        beds: totals.beds,
        filled: totals.filled,
        vacant: totals.vacant,
        overdue: totals.overdue,
        pendingPayments: totals.pending.payments,
        pendingBookings: totals.pending.bookings,
      });
      setBills(b);
      setTenants(t);
    })().catch(() => setError("Dashboard could not load. Please refresh to try again."));
  }, [dashboard]);

  const q = search.trim().toLowerCase();
  const filteredTenants = q
    ? tenants.filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          x.phone.includes(q) ||
          (x.rooms?.room_number ?? "").toLowerCase().includes(q),
      )
    : tenants;

  return (
    <AppShell>
      <div className="space-y-6">
        <PageHeader title="Namaste 👋" subtitle="Aapke property ka quick overview." />

        <RoomInsightsCard />
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 p-4 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {stats && (stats.overdue > 0 || stats.pendingPayments > 0 || stats.pendingBookings > 0) && (
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Action required</h2>
            {[
              [stats.overdue > 0, `${formatINR(stats.overdue)} rent overdue hai`, "/bills", true],
              [
                stats.pendingPayments > 0,
                `${stats.pendingPayments} payment proof verify karne hain`,
                "/payment-verify",
                false,
              ],
              [
                stats.pendingBookings > 0,
                `${stats.pendingBookings} naye booking requests`,
                "/bookings",
                false,
              ],
            ].map(([show, label, href, urgent]) =>
              show ? (
                <a
                  key={String(href)}
                  href={String(href)}
                  className={`flex min-h-20 items-center justify-between gap-4 rounded-2xl border border-border border-l-4 bg-card p-5 font-medium shadow-card ${urgent ? "border-l-destructive" : "border-l-brand-gold"}`}
                >
                  <span>{String(label)}</span>
                  <span aria-hidden="true" className="text-muted-foreground">
                    →
                  </span>
                </a>
              ) : null,
            )}
          </section>
        )}

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <StatCard
            label="Rooms / beds"
            value={stats ? `${stats.totalRooms} / ${stats.beds}` : "—"}
            icon={DoorOpen}
          />
          <StatCard
            label="Filled / vacant beds"
            value={stats ? `${stats.filled} / ${stats.vacant}` : "—"}
            icon={Users}
            accent="text-success"
          />
          <StatCard
            label="Pending dues"
            value={formatINR(stats?.pendingAmount ?? 0)}
            icon={Clock}
            accent="text-warning"
          />
          <StatCard
            label="This month income"
            value={formatINR(stats?.monthIncome ?? 0)}
            icon={Wallet}
            accent="text-success"
          />
        </div>

        <div className="grid xl:grid-cols-2 gap-4">
          <div className="min-w-0 rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-card">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">Recent bills</h2>
              <Link to="/bills" className="text-xs text-primary font-medium hover:underline">
                View all →
              </Link>
            </div>
            {bills.length === 0 ? (
              <EmptyState icon={Receipt} title="Abhi koi bills nahi." />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {bills.slice(0, 6).map((b) => (
                  <li
                    key={b.id}
                    className="py-2.5 flex flex-wrap items-start justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-medium [overflow-wrap:anywhere]">
                        {b.tenants?.name || "Tenant"} · Room {b.rooms?.room_number}
                      </div>
                      <div className="text-xs text-muted-foreground">Due {b.due_date}</div>
                    </div>
                    <div className="min-w-0 ml-auto text-right">
                      <div className="font-semibold tabular-nums [overflow-wrap:anywhere]">
                        {formatINR(Number(b.total_amount))}
                      </div>
                      <div
                        className={`text-[10px] uppercase tracking-wide ${b.status === "paid" ? "text-success" : "text-warning"}`}
                      >
                        {b.status}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-w-0 rounded-2xl bg-card border border-border p-4 sm:p-5 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
              <h2 className="font-medium">Active tenants</h2>
              <div className="relative min-w-0 flex-1 basis-36">
                <Search className="size-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Search tenants by name, phone or room"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search…"
                  className="min-h-11 pl-7 pr-2 py-2 text-sm rounded-md bg-background border border-input outline-none focus:ring-2 ring-ring/40 w-full"
                />
              </div>
            </div>
            {filteredTenants.length === 0 ? (
              <EmptyState
                icon={Users}
                title={
                  q ? "Is search se koi tenant nahi mila." : "Abhi koi active tenant nahi hai."
                }
              />
            ) : (
              <ul className="divide-y divide-border text-sm">
                {filteredTenants.slice(0, 6).map((t) => (
                  <li key={t.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium [overflow-wrap:anywhere]">{t.name}</div>
                      <div className="text-xs text-muted-foreground break-words">
                        Room {t.rooms?.room_number} · {t.phone}
                      </div>
                    </div>
                    <CheckCircle2
                      className="size-4 shrink-0 text-success"
                      aria-label="Active tenant"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <WhatsAppAutomationPanel />
      </div>
    </AppShell>
  );
}
