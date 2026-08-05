import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { claimRole } from "@/lib/account.functions";
import { Loader2, Building2, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/landlord/login")({
  component: LandlordLogin,
  head: () => ({ meta: [{ title: "Landlord sign in — ManageYourRoom" }, { name: "robots", content: "noindex" }] }),
});

function LandlordLogin() {
  const nav = useNavigate();
  const claim = useServerFn(claimRole);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await claim({ data: { role: "landlord" } });
      if (res.ok) nav({ to: "/rentdesk" });
      else if (res.mismatch && res.existing === "tenant") {
        setError("Ye email tenant account se registered hai. Please use Tenant login.");
        await supabase.auth.signOut();
      }
    })();
  }, [nav, claim]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/landlord/login`, data: { full_name: name, intended_role: "landlord" } },
        });
        if (error) throw error;
        if (!data.session) {
          // Try immediate sign-in (auto-confirm may be on)
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw siErr;
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const res = await claim({ data: { role: "landlord" } });
      if (!res.ok && res.mismatch) {
        setError(`Ye email pehle se ${res.existing} account hai. Tenant login use karein.`);
        await supabase.auth.signOut();
        return;
      }
      nav({ to: "/rentdesk" });
    } catch (err: any) {
      setError(err?.message ?? "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4 hover:text-foreground"><ArrowLeft className="size-3" /> Back to home</Link>
        <div className="flex items-center gap-2 mb-6">
          <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><Building2 className="size-5" /></div>
          <div>
            <div className="font-semibold">Landlord portal</div>
            <div className="text-xs text-muted-foreground">RentDesk & MYR listings</div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-medium mb-4">
            <button type="button" onClick={() => { setMode("signin"); setError(null); }}
              className={`py-1.5 rounded-md transition ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setError(null); }}
              className={`py-1.5 rounded-md transition ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Create landlord account</button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
            )}
            <Field label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></Field>
            <Field label="Password"><input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "Create landlord account" : "Sign in as landlord"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Tenant hain? <Link to="/tenant/login" className="text-primary font-medium hover:underline">Tenant login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs font-medium text-muted-foreground">{label}</span><div className="mt-1">{children}</div></label>;
}
