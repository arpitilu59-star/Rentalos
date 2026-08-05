import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { LISTING_TYPE_LABEL, type ListingType } from "@/lib/myr";
import { Loader2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/new")({ component: NewListing });

function NewListing() {
  const nav = useNavigate();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    title: "", description: "", type: "pg" as ListingType,
    address_line: "", city: "", state: "", pincode: "",
    rules: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { nav({ to: "/login" }); return; }
    const { data, error } = await supabase.from("myr_listings").insert({ landlord_id: user.id, ...f, status: "draft" }).select("id").single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    nav({ to: "/myr/landlord/$id", params: { id: data.id } });
  };

  return (
    <MyrShell variant="landlord">
      <button onClick={() => nav({ to: "/myr/landlord/listings" })} className="inline-flex items-center gap-1 text-sm mb-4 hover:underline"><ArrowLeft className="size-4" /> Back</button>
      <h1 className="text-2xl font-semibold tracking-tight mb-4">Create listing</h1>
      <form onSubmit={submit} className="max-w-2xl space-y-3 rounded-2xl bg-card border border-border p-5">
        <Field label="Title" value={f.title} onChange={(v) => setF({ ...f, title: v })} required />
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as ListingType })} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm">
            {Object.entries(LISTING_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Description</span>
          <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} rows={4} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
        </label>
        <Field label="Address" value={f.address_line} onChange={(v) => setF({ ...f, address_line: v })} />
        <div className="grid grid-cols-3 gap-2">
          <Field label="City" value={f.city} onChange={(v) => setF({ ...f, city: v })} />
          <Field label="State" value={f.state} onChange={(v) => setF({ ...f, state: v })} />
          <Field label="Pincode" value={f.pincode} onChange={(v) => setF({ ...f, pincode: v })} />
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">House rules (optional)</span>
          <textarea value={f.rules} onChange={(e) => setF({ ...f, rules: e.target.value })} rows={2} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
        </label>
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          {saving && <Loader2 className="size-4 animate-spin" />} Create & continue
        </button>
      </form>
    </MyrShell>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (v: string) => void; required?: boolean }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input required={required} value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
    </label>
  );
}
