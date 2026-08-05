import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { getSettings, updateSettings, type Settings } from "@/lib/db";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

function SettingsPage() {
  const [s, setS] = useState<Settings | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { getSettings().then(setS).catch(() => {}); }, []);

  if (!s) return <AppShell><p className="text-muted-foreground">Loading…</p></AppShell>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await updateSettings({
      cleaning_amount: Number(s.cleaning_amount),
      water_per_person: Number(s.water_per_person),
      electricity_per_unit: Number(s.electricity_per_unit),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppShell>
      <div className="max-w-lg">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Pricing Settings</h1>
        <p className="text-muted-foreground mt-1">Default rules — har naye bill par lagti hain (per-room override bhi available hai).</p>

        <form onSubmit={submit} className="mt-6 rounded-2xl bg-card border border-border p-5 shadow-card space-y-4">
          <Field label="Cleaning charge (₹ per room / month)"><input type="number" min="0" value={s.cleaning_amount} onChange={(e) => setS({ ...s, cleaning_amount: Number(e.target.value) })} className={input} /></Field>
          <Field label="Water bill (₹ per person / month)"><input type="number" min="0" value={s.water_per_person} onChange={(e) => setS({ ...s, water_per_person: Number(e.target.value) })} className={input} /></Field>
          <Field label="Electricity rate (₹ per unit)"><input type="number" min="0" step="0.01" value={s.electricity_per_unit} onChange={(e) => setS({ ...s, electricity_per_unit: Number(e.target.value) })} className={input} /></Field>
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-success">Saved ✓</span>}
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save settings"}</button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
