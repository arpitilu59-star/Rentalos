import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle } from "lucide-react";
import {
  getMyWhatsAppLink,
  startWhatsAppLink,
  confirmWhatsAppLink,
  setWhatsAppOptIn,
  unlinkWhatsApp,
} from "@/lib/whatsapp.link.functions";

const errMsg = (e: unknown) =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";

export function WhatsAppLinkCard() {
  const qc = useQueryClient();
  const getLink = useServerFn(getMyWhatsAppLink);
  const start = useServerFn(startWhatsAppLink);
  const confirm = useServerFn(confirmWhatsAppLink);
  const optIn = useServerFn(setWhatsAppOptIn);
  const unlink = useServerFn(unlinkWhatsApp);

  const q = useQuery({ queryKey: ["whatsapp-link"], queryFn: () => getLink(), retry: false });
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const run = async (fn: () => Promise<string | void>) => {
    setBusy(true);
    setMsg(null);
    try {
      const ok = await fn();
      if (ok) setMsg({ kind: "ok", text: ok });
      await qc.invalidateQueries({ queryKey: ["whatsapp-link"] });
    } catch (e) {
      setMsg({ kind: "err", text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const link = q.data?.link;
  const verified = !!link?.verified;

  return (
    <section className="rounded-xl border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold">
        <MessageCircle className="h-4 w-4" /> WhatsApp updates
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Get rent, payment and maintenance updates on WhatsApp. You can turn this off any time.
      </p>
      {q.data && !q.data.liveDelivery && (
        <p className="mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          WhatsApp delivery isn't switched on for this site yet, so codes and messages are
          simulated.
        </p>
      )}

      {q.isLoading && <Loader2 className="mt-3 h-4 w-4 animate-spin" />}
      {q.isError && (
        <p className="mt-3 text-sm text-destructive">
          Couldn't load WhatsApp settings. Refresh to try again.
        </p>
      )}

      {q.data && !verified && (
        <div className="mt-4 space-y-3">
          <div className="flex gap-2">
            <input
              className="h-10 flex-1 rounded-md border bg-background px-3 text-sm"
              placeholder="+919876543210"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <button
              disabled={busy || !phone}
              className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
              onClick={() =>
                run(async () => {
                  const r = await start({ data: { phone } });
                  setCodeSent(true);
                  return r.mocked
                    ? "Code generated, but delivery is simulated on this site."
                    : "Code sent on WhatsApp.";
                })
              }
            >
              Send code
            </button>
          </div>
          {codeSent && (
            <div className="flex gap-2">
              <input
                className="h-10 flex-1 rounded-md border bg-background px-3 text-sm tracking-widest"
                placeholder="6-digit code"
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              />
              <button
                disabled={busy || code.length !== 6}
                className="h-10 rounded-md bg-primary px-4 text-sm text-primary-foreground disabled:opacity-50"
                onClick={() =>
                  run(async () => {
                    await confirm({ data: { code } });
                    setCode("");
                    setCodeSent(false);
                    return "WhatsApp linked.";
                  })
                }
              >
                Verify
              </button>
            </div>
          )}
        </div>
      )}

      {q.data && verified && link && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            Linked: <span className="font-medium">{link.phone_e164}</span>
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={link.opted_in}
              disabled={busy}
              onChange={(e) =>
                run(async () => {
                  await optIn({ data: { optedIn: e.target.checked } });
                })
              }
            />
            Send me updates on WhatsApp
          </label>
          <button
            disabled={busy}
            className="text-destructive underline disabled:opacity-50"
            onClick={() =>
              run(async () => {
                await unlink();
                return "WhatsApp unlinked.";
              })
            }
          >
            Unlink number
          </button>
        </div>
      )}

      {msg && (
        <p
          role="status"
          className={`mt-3 text-sm ${msg.kind === "err" ? "text-destructive" : "text-emerald-600"}`}
        >
          {msg.text}
        </p>
      )}
    </section>
  );
}
