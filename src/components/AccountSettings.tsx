import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { deleteMyAccount } from "@/lib/account.functions";
import { Loader2, KeyRound, Trash2, LogOut, ShieldAlert } from "lucide-react";

export function AccountSettings({ onSignedOutTo = "/" as const }: { onSignedOutTo?: string }) {
  const nav = useNavigate();
  const del = useServerFn(deleteMyAccount);
  const [newPw, setNewPw] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [showDel, setShowDel] = useState(false);
  const [delPw, setDelPw] = useState("");
  const [delLoading, setDelLoading] = useState(false);
  const [delErr, setDelErr] = useState<string | null>(null);

  const changePw = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwLoading(true); setPwMsg(null);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwLoading(false);
    setPwMsg(error ? error.message : "Password updated");
    if (!error) setNewPw("");
  };

  const doDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    setDelLoading(true); setDelErr(null);
    try {
      await del({ data: { password: delPw || undefined } });
      await supabase.auth.signOut();
      nav({ to: onSignedOutTo as any, replace: true });
    } catch (err: any) {
      setDelErr(err?.message ?? "Failed");
      setDelLoading(false);
    }
  };

  const signOut = async () => { await supabase.auth.signOut(); nav({ to: onSignedOutTo as any, replace: true }); };

  return (
    <div className="mt-6 space-y-4">
      <section className="rounded-2xl bg-card border border-border p-5 shadow-card">
        <div className="flex items-center gap-2 text-sm font-medium"><KeyRound className="size-4" /> Change password</div>
        <form onSubmit={changePw} className="mt-3 flex flex-col sm:flex-row gap-2">
          <input type="password" required minLength={6} value={newPw} onChange={(e) => setNewPw(e.target.value)} placeholder="New password (min 6 chars)"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
          <button disabled={pwLoading} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            {pwLoading && <Loader2 className="size-4 animate-spin" />} Update
          </button>
        </form>
        {pwMsg && <p className="text-xs mt-2 text-muted-foreground">{pwMsg}</p>}
      </section>

      <section className="rounded-2xl bg-card border border-border p-5 shadow-card">
        <button onClick={signOut} className="inline-flex items-center gap-2 text-sm text-foreground hover:text-primary"><LogOut className="size-4" /> Sign out</button>
      </section>

      <section className="rounded-2xl bg-destructive/5 border border-destructive/30 p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive"><ShieldAlert className="size-4" /> Danger zone</div>
        <p className="text-xs text-muted-foreground mt-1">Permanent account deletion cannot be undone.</p>
        {!showDel ? (
          <button onClick={() => setShowDel(true)} className="mt-3 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-destructive/40 text-destructive text-sm">
            <Trash2 className="size-4" /> Delete my account
          </button>
        ) : (
          <form onSubmit={doDelete} className="mt-3 space-y-2">
            <p className="text-xs text-destructive">Type your password to confirm.</p>
            <input type="password" value={delPw} onChange={(e) => setDelPw(e.target.value)} placeholder="Current password"
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
            {delErr && <p className="text-xs text-destructive">{delErr}</p>}
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowDel(false); setDelPw(""); setDelErr(null); }} className="px-3 py-2 text-sm rounded-lg border border-border">Cancel</button>
              <button disabled={delLoading} className="inline-flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-destructive text-destructive-foreground font-medium disabled:opacity-60">
                {delLoading && <Loader2 className="size-4 animate-spin" />} Permanently delete
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
