import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { submitFeedback } from "@/lib/product.functions";

export const Route = createFileRoute("/_authenticated/feedback")({ component: FeedbackPage });

const KINDS = [
  ["bug", "Something is broken"],
  ["support", "I need help"],
  ["idea", "Suggestion / idea"],
  ["other", "Other"],
] as const;

function FeedbackPage() {
  const send = useServerFn(submitFeedback);
  const [kind, setKind] = useState<(typeof KINDS)[number][0]>("bug");
  const [body, setBody] = useState("");
  const m = useMutation({
    mutationFn: () => send({ data: { kind, body, screen: document.referrer ? new URL(document.referrer).pathname : undefined } }),
    onSuccess: () => setBody(""),
  });
  return (
    <div className="max-w-xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Help & feedback</h1>
        <p className="text-sm text-muted-foreground">Tell us what went wrong or what you need. Our team reads every message. Please don't include passwords.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {KINDS.map(([k, label]) => (
          <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 text-sm ${kind === k ? "bg-primary text-primary-foreground" : ""}`}>
            {label}
          </button>
        ))}
      </div>
      <textarea
        className="w-full min-h-32 rounded-xl border bg-background p-3 text-sm"
        maxLength={2000}
        placeholder="Describe the problem or idea…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <button
        disabled={body.trim().length < 3 || m.isPending}
        onClick={() => m.mutate()}
        className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        {m.isPending ? "Sending…" : "Send"}
      </button>
      {m.isSuccess && <p className="text-sm text-emerald-600">Thanks! We received your message.</p>}
      {m.error && <p className="text-sm text-destructive">{(m.error as Error).message}</p>}
    </div>
  );
}
