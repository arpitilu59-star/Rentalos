import { useEffect, useRef, useState } from "react";
import { Volume2, Square } from "lucide-react";
import {
  ACK_LABELS,
  REQUIRED_ACKS,
  termsToSpeech,
  type Acks,
  type Terms,
} from "@/lib/terms/schema";
import { TermsView, CompletenessBadge } from "./TermsView";

export type GateValue = { acknowledgements: Acks; listened: boolean; complete: boolean };

/**
 * Pre-booking terms gate. The optional "Listen" button reads a summary aloud
 * for accessibility; it NEVER ticks anything and is not consent. Only the
 * tenant's own checkboxes count, and the server re-checks them.
 */
export function TermsGate({
  terms,
  version,
  rent,
  deposit,
  onChange,
}: {
  terms: Terms;
  version: number;
  rent: number;
  deposit: number | null;
  onChange: (v: GateValue) => void;
}) {
  const [acks, setAcks] = useState<Acks>({});
  const [listened, setListened] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const canSpeak = typeof window !== "undefined" && "speechSynthesis" in window;
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    cb.current({
      acknowledgements: acks,
      listened,
      complete: REQUIRED_ACKS.every((k) => acks[k] === true),
    });
  }, [acks, listened]);
  useEffect(
    () => () => {
      if (canSpeak) window.speechSynthesis.cancel();
    },
    [canSpeak],
  );

  const toggleSpeak = () => {
    if (!canSpeak) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(termsToSpeech(terms, { rent, deposit }));
    u.onend = () => {
      setSpeaking(false);
      setListened(true);
    };
    u.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(u);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-sm font-medium">Rental terms (v{version})</div>
        <CompletenessBadge terms={terms} />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-lg border border-border p-3">
        <TermsView terms={terms} rent={rent} deposit={deposit} />
      </div>
      {canSpeak && (
        <button
          type="button"
          onClick={toggleSpeak}
          className="inline-flex items-center gap-2 text-xs rounded-lg border border-border px-3 py-1.5 hover:bg-accent"
        >
          {speaking ? <Square className="size-3.5" /> : <Volume2 className="size-3.5" />}
          {speaking ? "Stop" : "Listen to important terms"}
        </button>
      )}
      <p className="text-[11px] text-muted-foreground">
        The read-aloud is only a summary to help you. It does not count as your agreement. Tick the
        boxes below yourself.
      </p>
      <div className="space-y-2">
        {REQUIRED_ACKS.map((k) => (
          <label key={k} className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acks[k] === true}
              onChange={(e) => setAcks((a) => ({ ...a, [k]: e.target.checked }))}
            />
            <span>{ACK_LABELS[k]}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
