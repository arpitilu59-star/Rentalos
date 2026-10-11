import { useEffect, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { friendlyResetError, validateEmail } from "@/lib/password-reset";

const COOLDOWN = 60;

/** Inline "Forgot password?" flow shown on the landlord and tenant sign-in cards. */
export function ForgotPassword({
  initialEmail,
  onBack,
}: {
  initialEmail: string;
  onBack: () => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || wait > 0) return;
    const bad = validateEmail(email);
    if (bad) return setError(bad);
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      // Only rate-limit/network errors are shown. "No such user" is never revealed.
      if (err && /rate|seconds|too many|network|fetch/i.test(err.message)) {
        setError(friendlyResetError(err.message));
      } else {
        setSent(true);
        setWait(COOLDOWN);
      }
    } catch (ex) {
      setError(friendlyResetError(ex instanceof Error ? ex.message : undefined));
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="space-y-3 text-center" role="status">
        <MailCheck className="size-8 mx-auto text-primary" />
        <p className="text-sm font-medium">Check your email</p>
        <p className="text-xs text-muted-foreground">
          If an account exists for <b>{email.trim()}</b>, we've sent a link to reset your password.
          The link expires soon. Check spam too.
        </p>
        <button
          type="button"
          onClick={() => setSent(false)}
          disabled={wait > 0}
          className="text-xs text-primary hover:underline disabled:text-muted-foreground disabled:no-underline"
        >
          {wait > 0 ? `Resend in ${wait}s` : "Didn't get it? Send again"}
        </button>
        <div>
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-muted-foreground hover:underline"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3" noValidate>
      <div>
        <p className="text-sm font-medium">Reset your password</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter your account email and we'll send you a reset link.
        </p>
      </div>
      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">Email</span>
        <input
          type="email"
          autoComplete="email"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      <button
        disabled={busy || wait > 0}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60"
      >
        {busy && <Loader2 className="size-4 animate-spin" />}
        {wait > 0 ? `Wait ${wait}s` : "Send reset link"}
      </button>
      <button
        type="button"
        onClick={onBack}
        className="w-full text-xs text-muted-foreground hover:underline"
      >
        Back to sign in
      </button>
    </form>
  );
}
