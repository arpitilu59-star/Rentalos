import { useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

/** Maps Supabase/Google OAuth failures to something a user can act on. */
export function googleErrorMessage(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("provider is not enabled") || m.includes("unsupported provider"))
    return "Google sign-in isn't switched on yet. Please use email and password for now.";
  if (m.includes("network") || m.includes("fetch")) return "Network problem. Check your connection and try again.";
  return "Couldn't start Google sign-in. Please try again.";
}

/**
 * "Continue with Google" via the project's own Supabase Auth (works on Vercel / rentalos.in).
 * `path` is where Google should return to — the login page that claims the role and redirects.
 */
export function GoogleButton({
  path,
  onError,
  label = "Continue with Google",
}: {
  path: string;
  onError: (message: string) => void;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const go = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}${path}`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (error) {
        onError(googleErrorMessage(error.message));
        setBusy(false);
      }
      // On success the browser is redirected to Google; nothing more to do here.
    } catch (e) {
      onError(googleErrorMessage(e instanceof Error ? e.message : undefined));
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
    >
      {busy ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
        </svg>
      )}
      {label}
    </button>
  );
}

export function OrDivider() {
  return (
    <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
      <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
    </div>
  );
}
