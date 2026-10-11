import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyEntitlements } from "@/lib/subscription.functions";
import type { EffectiveEntitlements, FeatureKey } from "./keys";

/** Client convenience only — the server and database enforce access independently. */
export function useEntitlements(enabled = true) {
  const fetchEnt = useServerFn(getMyEntitlements);
  const q = useQuery<EffectiveEntitlements>({
    queryKey: ["my-entitlements"],
    queryFn: () => fetchEnt(),
    enabled,
    staleTime: 30_000,
    retry: 1,
  });
  const can = (f: FeatureKey) => q.data?.features?.[f] === true;
  return { ...q, ent: q.data, can };
}
