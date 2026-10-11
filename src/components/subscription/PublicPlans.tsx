import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { getPublicPlans } from "@/lib/subscription.functions";
import { PlanComparison } from "./PlanComparison";
import type { EntRow, FeatureRow, PlanRow } from "./plan-view";

/** Public pricing grid, rendered from the same database matrix the app enforces. */
export function PublicPlans() {
  const fetchPlans = useServerFn(getPublicPlans);
  const q = useQuery({
    queryKey: ["public-plans"],
    queryFn: () => fetchPlans(),
    staleTime: 60_000,
    retry: 1,
  });
  if (q.isLoading)
    return (
      <div className="py-10 grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  if (q.isError || !q.data) {
    return (
      <p className="text-sm text-muted-foreground text-center py-8">
        Plans couldn't be loaded right now.{" "}
        <button className="underline" onClick={() => q.refetch()}>
          Try again
        </button>
      </p>
    );
  }
  return (
    <PlanComparison
      plans={q.data.plans as PlanRow[]}
      features={q.data.features as FeatureRow[]}
      entitlements={q.data.entitlements as EntRow[]}
      action={(plan) => (
        <Link
          to="/landlord/login"
          className={`w-full inline-flex items-center justify-center px-4 py-2.5 rounded-xl text-sm font-medium ${plan.code === "RENTDESK" ? "bg-primary text-primary-foreground hover:opacity-90" : "border border-border hover:bg-accent"}`}
        >
          {plan.code === "FREE" ? "Start free" : "Sign in to upgrade"}
        </Link>
      )}
    />
  );
}
