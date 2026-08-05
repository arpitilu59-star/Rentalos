import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { claimRole } from "@/lib/account.functions";
import { Loader2, User, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/tenant/login")({
  component: TenantLogin,
  head: () => ({ meta: [{ title: "Tenant sign in — ManageYourRoom" }, { name: "robots", content: "noindex" }] }),
});

function TenantLogin() {
  const nav = useNavigate();
  const claim = useServerFn(claimRole);
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getRedirect = () => {
    if (typeof window === "undefined") return null;
    const r = new URL(window.location.href).searchParams.get("redirect");
    return r && r.startsWith("/") ? r : null;
  };
  const goNext = () => {
    const r = getRedirect();
    if (r) window.location.href = r;
    else nav({ to: "/tenant" });
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await claim({ data: { role: "tenant" } });
      if (res.ok) goNext();
      else if (res.mismatch && res.existing === "landlord") {
        setError("Ye email landlord account se registered hai. Please use Landlord login.");
        await supabase.auth.signOut();
      }
    })();
  }, [claim]);

  const normalizeMobile = (raw: string) => {
    const t = raw.trim().replace(/[\s\-()]/g, "");
    if (t.startsWith("+")) return t;
    if (/^\d{10}$/.test(t)) return "+91" + t;
    return t;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${window.location.origin}/tenant/login`, data: { full_name: name, intended_role: "tenant" } },
        });
        if (error) throw error;
        if (!data.session) {
          const { error: siErr } = await supabase.auth.signInWithPassword({ email, password });
          if (siErr) throw siErr;
        }
        if (mobile) {
          const m = normalizeMobile(mobile);
          const { data: { user } } = await supabase.auth.getUser();
          if (user) await supabase.from("profiles").upsert({ id: user.id, full_name: name, mobile: m, email });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const res = await claim({ data: { role: "tenant" } });
      if (!res.ok && res.mismatch) {
        setError(`Ye email pehle se ${res.existing} account hai. Landlord login use karein.`);
        await supabase.auth.signOut();
        return;
      }
      goNext();
    } catch (err: any) {
      setError(err?.message ?? "Failed");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground mb-4 hover:text-foreground"><ArrowLeft className="size-3" /> Back to home</Link>
        <div className="flex items-center gap-2 mb-6">
          <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center"><User className="size-5" /></div>
          <div>
            <div className="font-semibold">Tenant portal</div>
            <div className="text-xs text-muted-foreground">Your room, bills & payments</div>
          </div>
        </div>

        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <div className="grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-medium mb-4">
            <button type="button" onClick={() => { setMode("signin"); setError(null); }}
              className={`py-1.5 rounded-md transition ${mode === "signin" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Sign in</button>
            <button type="button" onClick={() => { setMode("signup"); setError(null); }}
              className={`py-1.5 rounded-md transition ${mode === "signup" ? "bg-card shadow-sm" : "text-muted-foreground"}`}>Create tenant account</button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} className={input} /></Field>
                <Field label="Mobile (for landlord to match your booking)"><input required type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="+91 98765 43210" className={input} /></Field>
              </>
            )}
            <Field label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} /></Field>
            <Field label="Password"><input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input} /></Field>
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />}
              {mode === "signup" ? "Create tenant account" : "Sign in as tenant"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Landlord hain? <Link to="/landlord/login" className="text-primary font-medium hover:underline">Landlord login</Link>
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
