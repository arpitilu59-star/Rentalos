import { useMemo } from "react";

export type BillFilterState = {
  year: string; // "all" | "2026"
  month: string; // "all" | "01".."12"
  status: string; // "all" | "pending" | "partial" | "paid"
};

export function useBillFilter(bills: any[], f: BillFilterState) {
  return useMemo(() => {
    return (bills ?? []).filter((b: any) => {
      const d = b.rent_period_start ? new Date(b.rent_period_start) : null;
      if (f.year !== "all" && (!d || String(d.getFullYear()) !== f.year)) return false;
      if (f.month !== "all" && (!d || String(d.getMonth() + 1).padStart(2, "0") !== f.month)) return false;
      if (f.status !== "all" && (b.status ?? "pending") !== f.status) return false;
      return true;
    });
  }, [bills, f.year, f.month, f.status]);
}

const MONTHS = [
  ["01", "Jan"], ["02", "Feb"], ["03", "Mar"], ["04", "Apr"], ["05", "May"], ["06", "Jun"],
  ["07", "Jul"], ["08", "Aug"], ["09", "Sep"], ["10", "Oct"], ["11", "Nov"], ["12", "Dec"],
] as const;

export function BillHistoryFilters({
  bills, value, onChange, hideStatus = false,
}: {
  bills: any[];
  value: BillFilterState;
  onChange: (v: BillFilterState) => void;
  hideStatus?: boolean;
}) {
  const years = useMemo(() => {
    const s = new Set<string>();
    for (const b of bills ?? []) if (b.rent_period_start) s.add(String(new Date(b.rent_period_start).getFullYear()));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [bills]);

  const sel = "px-2 py-1.5 text-xs rounded-md bg-background border border-input";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <select className={sel} value={value.year} onChange={(e) => onChange({ ...value, year: e.target.value })}>
        <option value="all">All years</option>
        {years.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className={sel} value={value.month} onChange={(e) => onChange({ ...value, month: e.target.value })}>
        <option value="all">All months</option>
        {MONTHS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      {!hideStatus && (
        <div className="flex gap-1">
          {(["all", "pending", "partial", "paid"] as const).map((s) => (
            <button key={s} onClick={() => onChange({ ...value, status: s })}
              className={`px-2.5 py-1 rounded-full text-[11px] capitalize font-medium ${value.status === s ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:bg-accent"}`}>
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
