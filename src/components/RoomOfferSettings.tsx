import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMyRoomOfferSettings, saveMyRoomOfferSettings } from "@/lib/bookings.functions";

/** Landlord-only, per room. The floor is private: the server never sends it to tenants. */
export function RoomOfferSettings({ roomId }: { roomId: string }) {
  const load = useServerFn(getMyRoomOfferSettings);
  const save = useServerFn(saveMyRoomOfferSettings);
  const [rent, setRent] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [min, setMin] = useState("");
  const [auto, setAuto] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    load({ data: { room_id: roomId } })
      .then((s) => {
        setRent(s.rent);
        setEnabled(s.offers_enabled);
        setMin(s.min_rent != null ? String(s.min_rent) : "");
        setAuto(s.auto_approve);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [roomId, load]);

  const submit = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const n = min.trim() ? Number(min.replace(/[, ₹]/g, "")) : null;
      await save({ data: { room_id: roomId, offers_enabled: enabled, min_rent: n, auto_approve: auto } });
      setMsg({ ok: true, text: "Offer settings saved." });
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
    setBusy(false);
  };

  if (!ready) return null;
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
      <div className="text-sm font-medium">Tenant offers (negotiation)</div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Is room par tenants ko offer dene dein
      </label>
      {enabled && (
        <>
          <label className="block text-xs text-muted-foreground">
            Aapka minimum rent (floor) — tenant ko kabhi nahi dikhega
            <input
              value={min}
              onChange={(e) => setMin(e.target.value)}
              inputMode="numeric"
              placeholder={rent ? `e.g. ${Math.round(rent * 0.9)} (listed ${rent})` : "minimum rent"}
              className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-foreground"
            />
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Floor ya usse upar ke offer ka rent auto-approve karein (booking aap phir bhi khud accept karenge)
          </label>
        </>
      )}
      <div className="flex items-center gap-3">
        <button type="button" onClick={submit} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-primary text-primary-foreground disabled:opacity-60">
          {busy ? "Saving…" : "Save offer settings"}
        </button>
        {msg && <span className={`text-xs ${msg.ok ? "text-emerald-600" : "text-destructive"}`}>{msg.text}</span>}
      </div>
    </div>
  );
}
