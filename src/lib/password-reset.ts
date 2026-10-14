/** Pure helpers for the forgot / reset password flow (unit-tested). */
export const MIN_PASSWORD = 8;

export function validateEmail(v: string): string | null {
  const s = v.trim();
  if (!s) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)) return "Enter a valid email address.";
  return null;
}

export function validateNewPassword(pw: string, confirm: string): string | null {
  if (pw.length < MIN_PASSWORD) return `Password must be at least ${MIN_PASSWORD} characters.`;
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use at least one letter and one number.";
  if (pw !== confirm) return "Passwords don't match.";
  return null;
}

/** Turn Supabase errors into plain messages. Never reveals whether an account exists. */
export function friendlyResetError(message: string | undefined): string {
  const m = (message ?? "").toLowerCase();
  if (m.includes("rate") || m.includes("seconds") || m.includes("too many")) {
    return "Too many requests. Please wait a minute and try again.";
  }
  if ((m.includes("same") || m.includes("different")) && m.includes("password"))
    return "Choose a password different from your old one.";
  if (m.includes("weak") || m.includes("pwned") || m.includes("password should")) {
    return "That password is too weak or commonly used. Try a longer, less common one.";
  }
  if (
    m.includes("expired") ||
    m.includes("invalid") ||
    m.includes("jwt") ||
    m.includes("session")
  ) {
    return "This reset link is invalid or has expired. Request a new one.";
  }
  if (m.includes("sending") || m.includes("smtp") || m.includes("mail"))
    return "We couldn't send the email right now. Please try again in a few minutes.";
  if (m.includes("network") || m.includes("fetch"))
    return "Network problem. Check your connection and try again.";
  return "Something went wrong. Please try again.";
}

/**
 * Inline script run before hydration. If Supabase delivers a recovery (or failed-recovery) link
 * to any page other than /reset-password — which happens when the redirect URL is not on the
 * project's allow-list and Supabase falls back to the Site URL — forward the visitor, hash
 * included, to /reset-password before the auth client consumes and strips the token.
 */
export const RECOVERY_REDIRECT_SCRIPT = `(function(){try{var l=window.location;var h=l.hash||"";if(l.pathname!=="/reset-password"&&(/[#&]type=recovery(&|$)/.test(h)||/error_code=otp_expired/.test(h)&&/error=access_denied/.test(h))){l.replace("/reset-password"+h);}}catch(e){}})();`;
