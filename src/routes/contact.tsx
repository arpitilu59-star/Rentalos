import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, CheckCircle2, Mail, Phone, ShieldCheck, Send, Loader2 } from "lucide-react";
import { SiteNavbar } from "@/components/SiteNavbar";
import { seo } from "@/lib/seo";
import { SUPPORT, SUPPORT_CATEGORIES } from "@/lib/support";

export const Route = createFileRoute("/contact")({
  component: ContactPage,
  head: () =>
    seo({
      title: "Contact RentalOS",
      description: "Get help with your room, booking, rent or RentalOS account.",
      path: "/contact",
    }),
});
export function ContactPage() {
  const id = useRef<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget,
      fields = Object.fromEntries(new FormData(form).entries());
    id.current ??= crypto.randomUUID();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/support/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...fields, id: id.current, consent: fields.consent === "on" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.error || "Your query could not be sent. Please try again.");
      setReference(data.reference);
      form.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection interrupted. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const input =
    "mt-2 min-h-12 w-full rounded-xl border border-input bg-background px-4 py-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />
      <main className="mx-auto max-w-6xl px-5 py-10 sm:py-16">
        <div className="mb-10 max-w-2xl">
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Contact RentalOS support
          </h1>
          <p className="mt-5 max-w-lg leading-relaxed text-muted-foreground">
            From finding a room to managing your rent, tell us what you need. Your query goes
            directly to our support inbox.
          </p>
        </div>
        <div className="grid items-start gap-7 lg:grid-cols-[.8fr_1.2fr]">
          <aside className="space-y-5">
            <section className="rounded-3xl bg-brand-navy p-7 text-white shadow-elevated">
              <h2 className="text-2xl font-semibold">Call or email us</h2>
              <div className="mt-7 space-y-4">
                <a
                  href={`mailto:${SUPPORT.email}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-white/15 p-3 focus-visible:outline"
                >
                  <Mail className="size-5 shrink-0 text-brand-gold-light" />
                  <span className="min-w-0 flex-1 break-all text-sm">{SUPPORT.email}</span>
                  <ArrowUpRight className="size-4 shrink-0" />
                </a>
                <a
                  href={`tel:${SUPPORT.phone}`}
                  className="flex min-h-14 items-center gap-3 rounded-xl border border-white/15 p-3 focus-visible:outline"
                >
                  <Phone className="size-5 shrink-0 text-brand-gold-light" />
                  <span className="flex-1 text-sm">{SUPPORT.displayPhone}</span>
                  <ArrowUpRight className="size-4" />
                </a>
              </div>
              <p className="mt-7 border-t border-white/15 pt-5 text-sm leading-relaxed text-slate-300">
                Have a booking or bill reference? Include it in your query so we can understand the
                issue.
              </p>
            </section>
            <p className="flex items-start gap-3 px-2 text-sm leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-brand-gold" />
              Your details are used to handle this query. Never share passwords, OTPs or bank card
              details.
            </p>
          </aside>
          <section className="rounded-3xl border border-border bg-card p-6 shadow-card sm:p-8">
            {reference ? (
              <div role="status" className="py-10 text-center">
                <CheckCircle2 className="mx-auto size-12 text-success" />
                <h2 className="mt-5 text-2xl font-semibold">Your query is on its way.</h2>
                <p className="mt-3 text-muted-foreground">
                  Our email service accepted your message for delivery to {SUPPORT.email}.
                </p>
                <p className="mt-5 break-all text-xs text-muted-foreground">
                  Reference: {reference}
                </p>
                <button
                  className="mt-7 min-h-12 rounded-xl bg-primary px-6 font-semibold text-primary-foreground"
                  onClick={() => {
                    id.current = null;
                    setReference("");
                  }}
                >
                  Send another query
                </button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">Send a query</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    We'll use your email to reply.
                  </p>
                </div>
                <fieldset disabled={busy} className="space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Full name
                      <input
                        name="name"
                        autoComplete="name"
                        required
                        minLength={2}
                        maxLength={100}
                        className={input}
                        placeholder="Your name"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      Email address
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        required
                        maxLength={254}
                        className={input}
                        placeholder="you@example.com"
                      />
                    </label>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm font-medium">
                      Phone <span className="font-normal text-muted-foreground">(optional)</span>
                      <input
                        name="phone"
                        type="tel"
                        autoComplete="tel"
                        maxLength={20}
                        className={input}
                        placeholder="+91"
                      />
                    </label>
                    <label className="block text-sm font-medium">
                      What is this about?
                      <select name="category" className={input} defaultValue="booking">
                        {Object.entries(SUPPORT_CATEGORIES).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label className="block text-sm font-medium">
                    Subject
                    <input
                      name="subject"
                      required
                      minLength={4}
                      maxLength={150}
                      className={input}
                      placeholder="A short summary of your query"
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    Your query
                    <textarea
                      name="message"
                      required
                      minLength={20}
                      maxLength={4000}
                      rows={5}
                      className={`${input} resize-y`}
                      placeholder="Tell us what happened, where you saw the issue and any booking or bill reference."
                    />
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      20–4,000 characters
                    </span>
                  </label>
                  <div aria-hidden="true" className="hidden">
                    <label>
                      Website
                      <input name="website" tabIndex={-1} autoComplete="off" />
                    </label>
                  </div>
                  <label className="flex items-start gap-3 text-sm leading-relaxed text-muted-foreground">
                    <input
                      type="checkbox"
                      name="consent"
                      required
                      className="mt-1 size-4 accent-primary"
                    />
                    I agree that RentalOS can use these details to respond to my query.
                  </label>
                </fieldset>
                {error && (
                  <p
                    role="alert"
                    className="rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive"
                  >
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={busy}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  {busy ? "Sending your query…" : "Send query"}
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
