import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import type { EffectiveEntitlements } from "@/lib/subscription/keys";

export function SubscriptionBanner({ ent }: { ent: EffectiveEntitlements }) {
  if (ent.status === "EXPIRED" || ent.status === "CANCELLED" || ent.status === "SUSPENDED") {
    if (!ent.has_rentdesk_data) return null;
    const why =
      ent.status === "SUSPENDED"
        ? "suspended"
        : ent.status === "CANCELLED"
          ? "cancelled"
          : "expired";
    return (
      <div className="bg-destructive/10 border-b border-destructive/30 px-4 py-2 text-sm flex items-center gap-2 justify-center text-center">
        <AlertTriangle className="size-4 text-destructive shrink-0" />
        <span>Your plan has {why}. Your data is safe and read-only.</span>
        <Link to="/subscription" className="font-medium underline">
          Renew
        </Link>
      </div>
    );
  }
  if (ent.status === "ACTIVE" && ent.expires_at) {
    const days = Math.ceil((new Date(ent.expires_at).getTime() - Date.now()) / 86400000);
    if (days <= 7 && days >= 0) {
      return (
        <div className="bg-amber-500/10 border-b border-amber-500/30 px-4 py-2 text-sm flex items-center gap-2 justify-center text-center">
          <Clock className="size-4 shrink-0" />
          <span>
            Your plan ends in{" "}
            {days === 0 ? "less than a day" : `${days} day${days === 1 ? "" : "s"}`}.
          </span>
          <Link to="/subscription" className="font-medium underline">
            Renew now
          </Link>
        </div>
      );
    }
  }
  return null;
}
