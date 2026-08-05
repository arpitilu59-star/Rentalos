import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  getMySecurity,
  beginTotpEnrollment,
  confirmTotpEnrollment,
  disableTotp,
} from "@/lib/admin-security.functions";
import { ShieldCheck, Loader2, Smartphone, Check, X } from "lucide-react";

export const Route = createFileRoute("/admin/security")({ component: SecurityPage });

function SecurityPage() {
  const qc = useQueryClient();
  const fetchSec = useServerFn(getMySecurity);
  const begin = useServerFn(beginTotpEnrollment);
  const confirm = useServerFn(confirmTotpEnrollment);
  const disable = useServerFn(disableTotp);

  const sec = useQuery({ queryKey: ["my-security"], queryFn: () => fetchSec() });

  const [enrollment, setEnrollment] = useState<{ otpauth: string; secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const startEnroll = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await begin();
      const qr = await QRCode.toDataURL(r.otpauth, { margin: 1, width: 220 });
      setEnrollment({ ...r, qr });
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const submitConfirm = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await confirm({ data: { code } });
      setEnrollment(null); setCode("");
      qc.invalidateQueries({ queryKey: ["my-security"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  };

  const submitDisable = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await disable({ data: { code: disableCode } });
      setDisableCode("");
      qc.invalidateQueries({ queryKey: ["my-security"] });
    } catch (e) { setErr(e instanceof Error ? e.message : "Invalid code"); }
    finally { setBusy(false); }
  };

  useEffect(() => { setErr(null); }, [code, disableCode]);

  if (sec.isLoading) return <Loader2 className="size-5 animate-spin" />;
  const enabled = sec.data?.totp_enabled;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2"><ShieldCheck className="size-5 text-primary" /> Account security</h1>
        <p className="text-xs text-muted-foreground mt-1">Manage two-factor authentication for your admin account.</p>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold flex items-center gap-2"><Smartphone className="size-4" /> Authenticator app (TOTP)</div>
            <div className="text-xs text-muted-foreground mt-1">Use Google Authenticator, 1Password, Authy, etc.</div>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${enabled ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
            {enabled ? <span className="inline-flex items-center gap-1"><Check className="size-3" /> Enabled</span> : <span className="inline-flex items-center gap-1"><X className="size-3" /> Disabled</span>}
          </span>
        </div>

        {!enabled && !enrollment && (
          <button onClick={startEnroll} disabled={busy} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
            {busy && <Loader2 className="size-4 animate-spin" />} Set up 2FA
          </button>
        )}

        {!enabled && enrollment && (
          <form onSubmit={submitConfirm} className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Scan this QR with your authenticator app, then enter the 6-digit code.</p>
            <img src={enrollment.qr} alt="2FA QR" className="rounded-lg border border-border bg-white p-2" width={220} height={220} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted-foreground">Can't scan? Enter secret manually</summary>
              <code className="block mt-2 p-2 rounded bg-muted text-[11px] break-all">{enrollment.secret}</code>
            </details>
            <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-center text-lg tracking-[0.5em] font-mono" placeholder="••••••" />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setEnrollment(null); setCode(""); }} className="px-3 py-2 rounded-lg border border-border text-sm">Cancel</button>
              <button disabled={busy || code.length !== 6} className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
                {busy && <Loader2 className="size-4 animate-spin" />} Activate 2FA
              </button>
            </div>
          </form>
        )}

        {enabled && (
          <form onSubmit={submitDisable} className="mt-4 space-y-3">
            <p className="text-xs text-muted-foreground">Enter a current 6-digit code to disable 2FA.</p>
            <input required inputMode="numeric" pattern="\d{6}" maxLength={6} value={disableCode}
              onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ""))}
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-center text-lg tracking-[0.5em] font-mono" placeholder="••••••" />
            {err && <p className="text-xs text-destructive">{err}</p>}
            <button disabled={busy || disableCode.length !== 6} className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium disabled:opacity-60">
              {busy && <Loader2 className="size-4 animate-spin" />} Disable 2FA
            </button>
          </form>
        )}
      </div>

      <div className="rounded-xl border border-border bg-card p-5 text-xs text-muted-foreground space-y-1">
        <div className="text-sm font-semibold text-foreground mb-2">Active protections</div>
        <div>• Failed-login lockout: 5 attempts / 15 min</div>
        <div>• Idle session timeout: 15 min auto sign-out</div>
        <div>• Email OTP required for sign-in on new devices</div>
        <div>• IP, city, country logged on every login attempt</div>
      </div>
    </div>
  );
}
