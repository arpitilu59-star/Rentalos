import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getOwnerId } from "@/lib/db";
import { Loader2, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/onboarding")({ component: Onboarding });

function Onboarding() {
  const nav = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Profile fields
  const [full_name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [business_name, setBiz] = useState("");
  const [upi_id, setUpi] = useState("");

  // Property fields
  const [p_name, setPName] = useState("");
  const [p_city, setPCity] = useState("");
  const [p_address, setPAddress] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setName(data.user?.user_metadata?.full_name ?? "");
      const { data: prof } = await supabase.from("profiles").select("*").maybeSingle();
      if (prof?.full_name && prof?.phone) setStep(2);
      if (prof) {
        setName(prof.full_name ?? "");
        setPhone(prof.phone ?? "");
        setCity(prof.city ?? "");
        setAddress(prof.address ?? "");
        setBiz(prof.business_name ?? "");
        setUpi(prof.upi_id ?? "");
      }
    })();
  }, []);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const owner_id = await getOwnerId();
    const { error } = await supabase.from("profiles").upsert({
      id: owner_id, full_name, phone, city, address, business_name, upi_id,
    });
    setLoading(false);
    if (error) setError(error.message);
    else setStep(2);
  };

  const saveProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    const owner_id = await getOwnerId();
    const { error } = await supabase.from("properties").insert({ owner_id, name: p_name, city: p_city, address: p_address });
    setLoading(false);
    if (error) setError(error.message);
    else nav({ to: "/" });
  };

  return (
    <div className="min-h-screen bg-background grid place-items-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">R</div>
          <div className="text-xl font-semibold">Setup your RentDesk</div>
        </div>

        <div className="flex items-center gap-3 mb-4 text-xs">
          <Pill done={step > 1} active={step === 1} num={1} label="Personal" />
          <div className="h-px flex-1 bg-border" />
          <Pill done={false} active={step === 2} num={2} label="Property" />
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          {step === 1 ? (
            <form onSubmit={saveProfile} className="space-y-3">
              <h2 className="text-lg font-semibold">Apke baare me</h2>
              <p className="text-xs text-muted-foreground">Ye bill par dikhega jo tenants ko bheja jayega.</p>
              <Field label="Pura naam *"><input required value={full_name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
              <Field label="Phone (WhatsApp) *"><input required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" className={input} /></Field>
              <Field label="Business / PG name (optional)"><input value={business_name} onChange={(e) => setBiz(e.target.value)} placeholder="e.g. Sai PG" className={input} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="City"><input value={city} onChange={(e) => setCity(e.target.value)} className={input} /></Field>
                <Field label="UPI ID (for payments)"><input value={upi_id} onChange={(e) => setUpi(e.target.value)} placeholder="name@upi" className={input} /></Field>
              </div>
              <Field label="Address"><textarea value={address} onChange={(e) => setAddress(e.target.value)} rows={2} className={input} /></Field>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
                {loading && <Loader2 className="size-4 animate-spin" />} Next: Add property
              </button>
            </form>
          ) : (
            <form onSubmit={saveProperty} className="space-y-3">
              <h2 className="text-lg font-semibold">Apki first property</h2>
              <p className="text-xs text-muted-foreground">Aap baad me aur properties add kar sakte hain.</p>
              <Field label="Property name *"><input required value={p_name} onChange={(e) => setPName(e.target.value)} placeholder="e.g. Sai PG / Building A" className={input} /></Field>
              <Field label="City"><input value={p_city} onChange={(e) => setPCity(e.target.value)} className={input} /></Field>
              <Field label="Address"><textarea value={p_address} onChange={(e) => setPAddress(e.target.value)} rows={2} className={input} /></Field>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex gap-2">
                <button type="button" onClick={() => setStep(1)} className="px-4 py-2.5 text-sm rounded-lg border border-border">Back</button>
                <button disabled={loading} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
                  {loading && <Loader2 className="size-4 animate-spin" />} Finish & open dashboard
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

function Pill({ done, active, num, label }: { done: boolean; active: boolean; num: number; label: string }) {
  return (
    <div className={`flex items-center gap-2 ${active ? "text-primary" : done ? "text-success" : "text-muted-foreground"}`}>
      <div className={`size-6 rounded-full grid place-items-center text-[11px] font-semibold ${done ? "bg-success text-success-foreground" : active ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
        {done ? <Check className="size-3" /> : num}
      </div>
      <span className="font-medium">{label}</span>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
