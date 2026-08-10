 import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getMyAdmin } from "@/lib/admin.functions";
import {
  checkAdminLockout,
  recordAdminLoginGeo,
  isDeviceTrusted,
  sendNewDeviceOtp,
  verifyNewDeviceOtp,
  getMySecurity,
  verifyTotpAtLogin,
} from "@/lib/admin-security.functions";
import { ShieldCheck, Loader2, KeyRound, Smartphone } from "lucide-react";

export const Route = createFileRoute("/system-admin-control")({
  component: SystemAdminLogin,
  head: () => ({ meta: [{ name: "robots", content: "noindex, nofollow" }, { title: "—" }] }),
});

function deviceFingerprint(): string {
  if (typeof window === "undefined") return "";
  const s = [navigator.userAgent, navigator.language, screen.width + "x" + screen.height, new Date().getTimezoneOffset()].join("|");
  let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; }
  return "fp_" + Math.abs(h).toString(36);
}

type Step = "credentials" | "email_otp" | "totp" | "done";

function SystemAdminLogin() {
  const nav = useNavigate();
  const checkLock = useServerFn(checkAdminLockout);
  const recLogin = useServerFn(recordAdminLoginGeo);
  const getMe = useServerFn(getMyAdmin);
  const checkDev = useServerFn(isDeviceTrusted);
  const sendOtp = useServerFn(sendNewDeviceOtp);
  const verifyOtp = useServerFn(verifyNewDeviceOtp);
  const getSec = useServerFn(getMySecurity);
  const verifyTotp = useServerFn(verifyTotpAtLogin);

  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [tcode, setTcode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      const me = await getMe().catch(() => null);
      if (me) nav({ to: "/admin" as never });
    });
  }, [nav, getMe]);

  const fp = typeof window !== "undefined" ? deviceFingerprint() : "";

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null); setInfo(null);
    try {
      const lock = await checkLock({ data: { email } });
      if (lock.locked) {
        setErr(`Too many failed attempts. Try again in ${Math.ceil(lock.retry_in_seconds / 60)} min.`);
        setLoading(false); return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        await recLogin({ data: { email, success: false, device_fingerprint: fp, reason: error.message } }).catch(() => {});
        setErr(error.message); setLoading(false); return;
      }
      const me = await getMe().catch(() => null);
      if (!me) {
        await recLogin({ data: { email, success: false, device_fingerprint: fp, reason: "not_admin" } }).catch(() => {});
        await supabase.auth.signOut();
        setErr("This account does not have admin access."); setLoading(false); return;
      }
      // Decide next step
      const dev = await checkDev({ data: { fingerprint: fp } });
      if (!dev.trusted) {
        const sent = await sendOtp({ data: { fingerprint: fp } });
        setSentTo(sent.sent_to);
        setStep("email_otp"); setLoading(false); return;
      }
      const sec = await getSec();
      if (sec.totp_enabled) { setStep("totp"); setLoading(false); return; }
      await recLogin({ data: { email, success: true, device_fingerprint: fp, reason: "trusted_device" } }).catch(() => {});
      nav({ to: "/admin" as never });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Sign-in failed"); setLoading(false);
    }
  };

  const submitEmailOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      await verifyOtp({ data: { code, fingerprint: fp } });
      const sec = await getSec();
      if (sec.totp_enabled) { setStep("totp"); setLoading(false); return; }
      await recLogin({ data: { email, success: true, device_fingerprint: fp, reason: "email_otp" } }).catch(() => {});
      nav({ to: "/admin" as never });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid code"); setLoading(false);
    }
  };

  const submitTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setErr(null);
    try {
      await verifyTotp({ data: { code: tcode } });
      await recLogin({ data: { email, success: true, device_fingerprint: fp, reason: "totp" } }).catch(() => {});
      nav({ to: "/admin" as never });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Invalid code"); setLoading(false);
    }
  };

  const resend = async () => {
    setLoading(true); setErr(null);
    try { const s = await sendOtp({ data: { fingerprint: fp } }); setSentTo(s.sent_to); setInfo("Code resent."); }
    catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-6">
          <ShieldCheck className="size-7 text-primary" />
          <div className="text-lg font-semibold tracking-tight">System Admin Control</div>
        </div>

        {step === "credentials" && (
          <form onSubmit={submitCredentials} className="rounded-2xl bg-card border border-border p-6 space-y-3">
            <h1 className="text-base font-semibold">Restricted access</h1>
            <p className="text-xs text-muted-foreground">Authorized personnel only. All attempts are logged with IP & location.</p>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Email</span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-muted-foreground">Password</span>
              <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
            </label>
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button disabled={loading} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />} Continue
            </button>
          </form>
        )}

        {step === "email_otp" && (
          <form onSubmit={submitEmailOtp} className="rounded-2xl bg-card border border-border p-6 space-y-3">
            <div className="flex items-center gap-2"><KeyRound className="size-4 text-primary" /><h1 className="text-base font-semibold">Verify new device</h1></div>
            <p className="text-xs text-muted-foreground">We sent a 6-digit code to <span className="font-medium">{sentTo}</span>. It expires in 10 min.</p>
            <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-center text-lg tracking-[0.5em] font-mono" placeholder="••••••" />
            {err && <p className="text-xs text-destructive">{err}</p>}
            {info && <p className="text-xs text-emerald-600">{info}</p>}
            <button disabled={loading || code.length !== 6} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />} Verify
            </button>
            <button type="button" onClick={resend} disabled={loading} className="w-full text-xs text-muted-foreground hover:text-foreground">Resend code</button>
          </form>
        )}

        {step === "totp" && (
          <form onSubmit={submitTotp} className="rounded-2xl bg-card border border-border p-6 space-y-3">
            <div className="flex items-center gap-2"><Smartphone className="size-4 text-primary" /><h1 className="text-base font-semibold">Authenticator code</h1></div>
            <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
            <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={tcode} onChange={(e) => setTcode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-center text-lg tracking-[0.5em] font-mono" placeholder="••••••" />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button disabled={loading || tcode.length !== 6} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60">
              {loading && <Loader2 className="size-4 animate-spin" />} Verify
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
