import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { seo } from "@/lib/seo";
import { friendlyResetError, validateNewPassword, MIN_PASSWORD } from "@/lib/password-reset";

export const Route = createFileRoute("/reset-password")({
  component: ResetPassword,
  head: () => seo({ title: "Reset password — Rentalos", description: "", noindex: true }),
});

type Phase = "checking" | "ready" | "invalid" | "done";

function ResetPassword() {
  const nav = useNavigate();
  const [phase, setPhase] = useState<Phase>("checking");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // The recovery link signs the user into a temporary session (PASSWORD_RECOVERY).
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!alive) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) setPhase("ready");
    });
    (async () => {
      const hash = window.location.hash || "";
      const query = window.location.search || "";
      if (/error=|error_code=/.test(hash + query)) {
        if (alive) setPhase("invalid");
        return;
      }
      const { data: s } = await supabase.auth.getSession();
      if (!alive) return;
      if (s.session) setPhase("ready");
      else setTimeout(() => alive && setPhase((p) => (p === "checking" ? "invalid" : p)), 2500);
    })();
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const bad = validateNewPassword(pw, confirm);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password: pw });
      if (err) throw err;
      // End the temporary recovery session so the user signs in fresh with the new password.
      await supabase.auth.signOut();
      setPhase("done");
    } catch (ex) {
      setError(friendlyResetError(ex instanceof Error ? ex.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  const input =
    "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm";

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm rounded-2xl bg-card border border-border p-6 shadow-card">
        {phase === "checking" && (
          <div className="py-8 grid place-items-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        )}

        {phase === "invalid" && (
          <div className="text-center space-y-3" role="alert">
            <AlertTriangle className="size-8 mx-auto text-destructive" />
            <p className="text-sm font-medium">This reset link is invalid or expired</p>
            <p className="text-xs text-muted-foreground">
              Reset links work once and expire quickly. Request a new one from the sign-in page.
            </p>
            <div className="flex gap-2 justify-center text-sm">
              <Link to="/landlord/login" className="text-primary hover:underline">
                Landlord login
              </Link>
              <span className="text-muted-foreground">·</span>
              <Link to="/tenant/login" className="text-primary hover:underline">
                Tenant login
              </Link>
            </div>
          </div>
        )}

        {phase === "ready" && (
          <form onSubmit={submit} className="space-y-3" noValidate>
            <div>
              <h1 className="text-base font-semibold">Set a new password</h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                At least {MIN_PASSWORD} characters with a letter and a number.
              </p>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                autoFocus
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">
                Confirm new password
              </span>
              <input
                type="password"
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className={`${input} mt-1`}
              />
            </label>
            {error && (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            )}
            <button
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {busy && <Loader2 className="size-4 animate-spin" />} Update password
            </button>
          </form>
        )}

        {phase === "done" && (
          <div className="text-center space-y-3" role="status">
            <CheckCircle2 className="size-8 mx-auto text-emerald-600" />
            <p className="text-sm font-medium">Password updated</p>
            <p className="text-xs text-muted-foreground">Sign in with your new password.</p>
            <button
              onClick={() => nav({ to: "/landlord/login" })}
              className="w-full rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium"
            >
              Landlord sign in
            </button>
            <Link to="/tenant/login" className="block text-xs text-primary hover:underline">
              Tenant sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
