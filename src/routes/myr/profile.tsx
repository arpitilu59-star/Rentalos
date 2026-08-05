import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { UserCircle, Loader2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/myr/profile")({ component: ProfilePage });

function ProfilePage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ display_name: "", bio: "", city: "", occupation: "" });
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { nav({ to: "/login" }); return; }
      const { data } = await supabase.from("myr_user_profiles").select("*").eq("user_id", session.user.id).maybeSingle();
      if (data) {
        setForm({ display_name: data.display_name || "", bio: data.bio || "", city: data.city || "", occupation: data.occupation || "" });
        setVerified(!!data.verified);
      }
      setLoading(false);
    })();
  }, [nav]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("myr_user_profiles").upsert({ user_id: user.id, ...form }, { onConflict: "user_id" });
    setSaving(false);
  };

  if (loading) return <MyrShell variant="tenant"><div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div></MyrShell>;

  return (
    <MyrShell variant="tenant">
      <div className="flex items-center gap-2 mb-4"><UserCircle className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">My profile</h1></div>
      <form onSubmit={save} className="max-w-lg space-y-3 rounded-2xl bg-card border border-border p-5">
        {verified && <div className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-success text-success-foreground"><ShieldCheck className="size-3" /> Verified</div>}
        <Field label="Display name" value={form.display_name} onChange={(v) => setForm({ ...form, display_name: v })} />
        <Field label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <Field label="Occupation" value={form.occupation} onChange={(v) => setForm({ ...form, occupation: v })} />
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Bio</span>
          <textarea value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} rows={3} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
        </label>
        <button disabled={saving} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium">
          {saving && <Loader2 className="size-4 animate-spin" />} Save
        </button>
      </form>
    </MyrShell>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
    </label>
  );
}
