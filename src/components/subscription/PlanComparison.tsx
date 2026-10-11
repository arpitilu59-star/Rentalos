import { Check, Minus } from "lucide-react";
import { planLines, priceText, type EntRow, type FeatureRow, type PlanRow } from "./plan-view";

/** Generated from the database matrix — never hand-written feature lists. */
export function PlanComparison({
  plans,
  features,
  entitlements,
  currentCode,
  prices,
  action,
}: {
  plans: PlanRow[];
  features: FeatureRow[];
  entitlements: EntRow[];
  currentCode?: string;
  prices?: Record<string, { original: number; discount: number; payable: number }>;
  action?: (plan: PlanRow) => React.ReactNode;
}) {
  return (
    <div className="grid md:grid-cols-3 gap-4 items-start">
      {plans.map((plan) => {
        const lines = planLines(plan, features, entitlements);
        const price = prices?.[plan.code];
        const highlighted = plan.code === "RENTDESK";
        return (
          <div
            key={plan.id}
            className={`rounded-2xl border p-5 ${highlighted ? "border-primary bg-primary/5" : "border-border bg-card"}`}
          >
            <div className="flex items-center justify-between">
              <div className="font-semibold text-lg">{plan.name}</div>
              {currentCode === plan.code && (
                <span className="text-[10px] uppercase tracking-wide rounded-full bg-primary text-primary-foreground px-2 py-0.5">
                  Current
                </span>
              )}
            </div>
            {plan.description && (
              <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
            )}
            <div className="mt-3 text-2xl font-semibold tracking-tight">
              {price && price.discount > 0 ? (
                <>
                  <span className="text-base line-through text-muted-foreground mr-2">
                    ₹{price.original}
                  </span>
                  {price.payable === 0 ? "Free" : `₹${price.payable}/mo`}
                </>
              ) : (
                priceText(plan)
              )}
            </div>
            {price && price.discount > 0 && (
              <div className="text-xs text-primary mt-1">Your discount: ₹{price.discount} off</div>
            )}
            <ul className="mt-4 space-y-1.5 text-sm">
              {lines.map((l) => (
                <li key={l.key} className="flex items-start gap-2">
                  {l.included ? (
                    <Check className="size-4 text-primary shrink-0 mt-0.5" aria-hidden />
                  ) : (
                    <Minus
                      className="size-4 text-muted-foreground/50 shrink-0 mt-0.5"
                      aria-hidden
                    />
                  )}
                  <span className={l.included ? "text-foreground" : "text-muted-foreground/60"}>
                    {l.label}
                    {l.text !== "Included" && l.text !== "Not included" ? `: ${l.text}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {action && <div className="mt-5">{action(plan)}</div>}
          </div>
        );
      })}
    </div>
  );
}
