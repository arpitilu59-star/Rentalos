// Monthly meter consumption + fault detection (same rules as the web room-analysis page).
export type Reading = { reading: number | string; reading_date: string };
export type Anomaly = {
  type: "spike" | "drop" | "stuck" | "rollback";
  month: string;
  detail: string;
};
export type MonthRow = {
  month: string;
  label: string;
  reading: number;
  units: number;
  raw: number;
};

const median = (nums: number[]) => {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export function analyseMeter(readings: Reading[]) {
  const byMonth = new Map<string, Reading>();
  for (const r of readings) {
    const key = r.reading_date.slice(0, 7);
    const ex = byMonth.get(key);
    if (!ex || r.reading_date > ex.reading_date) byMonth.set(key, r);
  }
  const sorted = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b));
  const monthly: MonthRow[] = sorted.map(([month, r], i, arr) => {
    const prev = i > 0 ? arr[i - 1][1] : null;
    const raw = prev ? Number(r.reading) - Number(prev.reading) : 0;
    return {
      month,
      label: new Date(month + "-01").toLocaleDateString("en-IN", {
        month: "short",
        year: "2-digit",
      }),
      reading: Number(r.reading),
      units: prev ? Math.max(0, Math.round(raw * 100) / 100) : 0,
      raw: Math.round(raw * 100) / 100,
    };
  });
  const anomalies: Anomaly[] = [];
  if (monthly.length >= 2) {
    const med = median(
      monthly
        .slice(1)
        .map((m) => m.units)
        .filter((u) => u > 0),
    );
    for (let i = 1; i < monthly.length; i++) {
      const m = monthly[i];
      if (m.raw < 0)
        anomalies.push({
          type: "rollback",
          month: m.label,
          detail: `Reading peeche gayi (${monthly[i - 1].reading} → ${m.reading}). Meter reset ya galat entry.`,
        });
      else if (m.units === 0 && monthly[i - 1].reading > 0)
        anomalies.push({
          type: "stuck",
          month: m.label,
          detail: "Zero consumption — meter ruka hua ya band ho sakta hai.",
        });
      else if (med > 0 && m.units > med * 3)
        anomalies.push({
          type: "spike",
          month: m.label,
          detail: `${m.units} units — normal ${Math.round(med)} se ${Math.round(m.units / med)}x zyada.`,
        });
      else if (med > 0 && m.units < med * 0.2 && m.units > 0)
        anomalies.push({
          type: "drop",
          month: m.label,
          detail: `${m.units} units — normal ${Math.round(med)} se bahut kam.`,
        });
    }
  }
  const total = monthly.reduce((s, m) => s + m.units, 0);
  return {
    monthly,
    anomalies,
    months_tracked: Math.max(0, monthly.length - 1),
    avg_units: monthly.length > 1 ? Math.round(total / (monthly.length - 1)) : 0,
    last_units: monthly.length ? monthly[monthly.length - 1].units : 0,
  };
}
