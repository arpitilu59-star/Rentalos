import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { AccountSettings } from "@/components/AccountSettings";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId, type Profile } from "@/lib/db";
import { getCurrentAddress } from "@/lib/geolocate";
import { Loader2, Check, MapPin } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({ component: ProfilePage });

function ProfilePage() {
  const [p, setP] = useState<Profile | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    supabase.from("profiles").select("*").maybeSingle().then(({ data }) => setP(data as Profile));
  }, []);

  if (!p) return <AppShell><Loader2 className="size-5 animate-spin text-muted-foreground" /></AppShell>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const owner_id = await getOwnerId();
    await supabase.from("profiles").upsert({ ...p, id: owner_id });
    setSaving(false);
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  };

  return (
    <AppShell>
      <div className="max-w-2xl">
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">My Profile</h1>
        <p className="text-muted-foreground mt-1">Ye details bills aur WhatsApp messages me dikhengi.</p>

        <form onSubmit={submit} className="mt-6 rounded-2xl bg-card border border-border p-5 shadow-card space-y-4">
          <div className="grid md:grid-cols-2 gap-3">
            <Field label="Full name"><input value={p.full_name ?? ""} onChange={(e) => setP({ ...p, full_name: e.target.value })} className={input} /></Field>
            <Field label="Phone (WhatsApp)"><input value={p.phone ?? ""} onChange={(e) => setP({ ...p, phone: e.target.value })} className={input} /></Field>
            <Field label="Email"><input value={p.email ?? ""} disabled className={input + " opacity-70"} /></Field>
            <Field label="Business / PG name"><input value={p.business_name ?? ""} onChange={(e) => setP({ ...p, business_name: e.target.value })} className={input} /></Field>
            <Field label="City"><input value={p.city ?? ""} onChange={(e) => setP({ ...p, city: e.target.value })} className={input} /></Field>
            <Field label="UPI ID (for payments)"><input value={p.upi_id ?? ""} onChange={(e) => setP({ ...p, upi_id: e.target.value })} placeholder="name@upi" className={input} /></Field>
            <Field label="WhatsApp sender number (Twilio)"><input value={p.whatsapp_from ?? ""} onChange={(e) => setP({ ...p, whatsapp_from: e.target.value })} placeholder="+14155238886 (Twilio sandbox)" className={input} /></Field>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground">Address</span>
              <LocationButton onPick={(addr, city) => setP({ ...p, address: addr, city: city ?? p.city })} />
            </div>
            <textarea value={p.address ?? ""} onChange={(e) => setP({ ...p, address: e.target.value })} rows={2} className={input} />
          </div>
          <Field label="Bank details (optional, shown in bills)"><textarea value={p.bank_details ?? ""} onChange={(e) => setP({ ...p, bank_details: e.target.value })} rows={2} placeholder="A/c, IFSC..." className={input} /></Field>
          <p className="text-[11px] text-muted-foreground">Twilio sandbox: tenants must first send <code className="px-1 bg-muted rounded">join &lt;your-sandbox-code&gt;</code> to the sandbox number from their WhatsApp. For production, get a WhatsApp-approved Twilio number.</p>

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-xs text-success inline-flex items-center gap-1"><Check className="size-3" /> Saved</span>}
            <button disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-primary text-primary-foreground font-medium disabled:opacity-60">{saving ? "Saving…" : "Save profile"}</button>
          </div>
        </form>

        <AccountSettings onSignedOutTo="/landlord/login" />
      </div>
    </AppShell>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}

function LocationButton({ onPick }: { onPick: (address: string, city?: string | null) => void }) {
  const [loading, setLoading] = useState(false);
  const grab = async () => {
    setLoading(true);
    try {
      const { address } = await getCurrentAddress();
      // Try to peel city out of "...city, state, ..."
      const parts = address.split(",").map((s) => s.trim());
      const city = parts.length >= 4 ? parts[parts.length - 4] : null;
      onPick(address, city);
    } catch (e) {
      alert("Location nahi mili: " + (e as Error).message);
    } finally { setLoading(false); }
  };
  return (
    <button type="button" onClick={grab} disabled={loading} className="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60">
      <MapPin className="size-3" /> {loading ? "Locating…" : "Use current location"}
    </button>
  );
}
