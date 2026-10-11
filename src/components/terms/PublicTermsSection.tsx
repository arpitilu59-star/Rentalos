import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getPublicTerms } from "@/lib/terms.functions";
import { TermsView, CompletenessBadge } from "./TermsView";

/** Listing page: the landlord's published terms, or an honest "not published". */
export function PublicTermsSection({
  propertyId,
  rent,
  deposit,
}: {
  propertyId: string | null;
  rent: number;
  deposit: number | null;
}) {
  const fetchTerms = useServerFn(getPublicTerms);
  const q = useQuery({
    queryKey: ["public-terms", propertyId],
    queryFn: () => fetchTerms({ data: { propertyId: propertyId! } }),
    enabled: !!propertyId,
    staleTime: 60_000,
  });
  if (!propertyId || q.isLoading) return null;
  const terms = q.data?.terms ?? null;
  return (
    <section className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">Rental terms & house rules</h3>
        <CompletenessBadge terms={terms} />
      </div>
      {terms ? (
        <>
          <TermsView terms={terms} rent={rent} deposit={deposit} />
          <p className="text-[11px] text-muted-foreground">
            Version {q.data?.version}. You'll be asked to confirm these before sending a booking
            request.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          The landlord hasn't published structured terms for this property yet. Ask about rent
          increases, notice period and rules before you pay.
        </p>
      )}
    </section>
  );
}
