import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteNavbar } from "@/components/SiteNavbar";
import { seo } from "@/lib/seo";
import { PLANS, formatPlanPrice } from "@/lib/pricing";
import { Check, Clock, Info } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () =>
    seo({
      title: "Pricing — Rentalos for landlords",
      description:
        "Rentalos charges for the software you use, never a percentage of your rent. Compare Free, Pro and Business plans for landlords, societies and property managers.",
      path: "/pricing",
    }),
});

function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNavbar />

      <section className="max-w-3xl mx-auto px-4 pt-16 pb-8 text-center">
        <h1 className="text-3xl md:text-5xl font-semibold tracking-tight">
          Pay for the software. <span className="text-primary">Not your rent.</span>
        </h1>
        <p className="mt-4 text-muted-foreground">
          Rentalos never takes a percentage of what you earn. Plans are for landlords, societies and
          property managers — tenants use Rentalos free.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-4 pb-8 grid md:grid-cols-3 gap-4 items-start">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-2xl border p-6 ${
              plan.highlighted ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="font-semibold text-lg">{plan.name}</div>
            <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>

            <div className="mt-4 text-2xl font-semibold tracking-tight">
              {formatPlanPrice(plan)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {plan.limits.properties === null
                ? "Unlimited properties"
                : `Up to ${plan.limits.properties} ${plan.limits.properties === 1 ? "property" : "properties"}`}
            </div>

            <ul className="mt-5 space-y-2 text-sm">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Check className="size-4 text-primary shrink-0 mt-0.5" />
                  <span className="text-muted-foreground">{f}</span>
                </li>
              ))}
              {plan.comingSoon?.map((f) => (
                <li key={f} className="flex items-start gap-2">
                  <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span className="text-muted-foreground/70">
                    {f} <span className="text-[10px] uppercase tracking-wide">· coming soon</span>
                  </span>
                </li>
              ))}
            </ul>

            <Link
              to="/landlord/login"
              className={`mt-6 w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium ${
                plan.highlighted
                  ? "bg-primary text-primary-foreground hover:opacity-90"
                  : "border border-border hover:bg-accent"
              }`}
            >
              {plan.id === "free" ? "Start free" : "Talk to us"}
            </Link>
          </div>
        ))}
      </section>

      {/* Honest status note — no checkout exists yet, so we say so
          rather than rendering a fake "Subscribe" button. */}
      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 text-sm">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Paid plans are being finalised. There's no automated checkout yet — paid upgrades are
            arranged directly with us and activated by our team. The Free plan is fully available
            today.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Rentalos · RentDesk
      </footer>
    </div>
  );
}
