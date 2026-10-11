import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";

const NAMES: Record<string, string> = {
  rentdesk_core: "RentDesk (tenants, bills, meters, deposits, moves and tickets)",
  payment_verification: "Payment verification",
  partner_import: "Partner bulk import",
  advanced_analytics: "Advanced analytics",
  ai_meter_ocr: "AI meter reading",
  live_feed_video: "Live-verified video",
  advanced_automation: "Advanced automation",
};

export function UpgradePrompt({ feature }: { feature: string }) {
  return (
    <div className="max-w-xl mx-auto p-6 md:p-10">
      <div className="rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto size-11 rounded-full bg-primary/10 text-primary grid place-items-center">
          <Lock className="size-5" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">This feature isn't in your plan</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {NAMES[feature] ?? "This feature"} needs a paid Rentalos plan. Your existing data stays
          safe either way.
        </p>
        <Link
          to="/subscription"
          className="mt-5 inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium hover:opacity-90"
        >
          See plans & upgrade
        </Link>
      </div>
    </div>
  );
}
