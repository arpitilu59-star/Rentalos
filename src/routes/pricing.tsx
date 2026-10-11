import { createFileRoute } from "@tanstack/react-router";
import { SiteNavbar } from "@/components/SiteNavbar";
import { seo } from "@/lib/seo";
import { PublicPlans } from "@/components/subscription/PublicPlans";
import { Info } from "lucide-react";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () =>
    seo({
      title: "Pricing — Rentalos for landlords",
      description:
        "Rentalos charges for the software you use, never a percentage of your rent. Compare the Free, RentDesk and RentalOS Management plans for landlords, societies and property managers.",
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

      <section className="max-w-5xl mx-auto px-4 pb-8">
        <PublicPlans />
      </section>

      <section className="max-w-3xl mx-auto px-4 pb-16">
        <div className="rounded-xl border border-border bg-card p-4 flex items-start gap-3 text-sm">
          <Info className="size-4 text-primary shrink-0 mt-0.5" />
          <p className="text-muted-foreground">
            Pay by UPI QR from your Subscription page, upload the screenshot, and our team activates
            your plan after checking the payment. There is no automatic checkout. If a plan ends,
            your data stays safe and read-only.
          </p>
        </div>
      </section>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Rentalos · RentDesk
      </footer>
    </div>
  );
}
