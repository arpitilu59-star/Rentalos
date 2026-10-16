import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoogleButton, OrDivider } from "@/components/GoogleButton";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/signup")({ component: SignupPage });

function SignupPage() {
  const nav = useNavigate();
  const [full_name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError(null); setInfo(null);
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: {
        data: { full_name },
        emailRedirectTo: window.location.origin,
      },
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    nav({ to: "/onboarding" });
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <div className="size-10 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold text-lg">R</div>
          <div className="text-xl font-semibold">RentDesk</div>
        </div>
        <div className="rounded-2xl bg-card border border-border p-6 shadow-card">
          <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
          <p className="text-sm text-muted-foreground mt-1">Landlords & PG owners — manage rent in minutes.</p>

          <div className="mt-5">
            <GoogleButton path="/landlord/login" onError={setError} />
          </div>
          <OrDivider />

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Full name</span>
              <input required value={full_name} onChange={(e) => setName(e.target.value)} className={input + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={input + " mt-1"} />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Password (min 6 chars)</span>
              <input required type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className={input + " mt-1"} />
            </label>
            {error && <p className="text-xs text-destructive">{error}</p>}
            {info && <p className="text-xs text-success">{info}</p>}
            <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />} Create account
            </button>
          </form>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Login</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

const input = "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40";
