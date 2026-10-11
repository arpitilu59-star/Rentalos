import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { adminTermsOverview } from "@/lib/terms.functions";

export const Route = createFileRoute("/admin/rental-terms")({ component: RentalTermsAdmin });

function RentalTermsAdmin() {
  const fn = useServerFn(adminTermsOverview);
  const q = useQuery({ queryKey: ["admin-terms"], queryFn: () => fn(), retry: false });
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data)
    return (
      <p className="text-sm text-destructive">
        Couldn't load rental terms activity. Refresh to retry.
      </p>
    );
  const d = q.data;
  const pct = d.publicProperties ? Math.round((d.withTerms / d.publicProperties) * 100) : 0;
  const cards: [string, string | number][] = [
    ["Public properties", d.publicProperties],
    ["With published terms", `${d.withTerms} (${pct}%)`],
    ["Terms acceptances", d.acceptances],
    ["Used read-aloud", d.listenedCount],
  ];
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold">Rental terms</h1>
        <p className="text-sm text-muted-foreground">
          Adoption and the latest tenant acceptances. Records are immutable.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(([l, v]) => (
          <div key={l} className="rounded-xl border border-border bg-card p-3">
            <div className="text-xs text-muted-foreground">{l}</div>
            <div className="text-xl font-semibold">{v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border divide-y divide-border bg-card text-sm">
        {d.recent.length === 0 && (
          <div className="p-3 text-muted-foreground">No acceptances yet.</div>
        )}
        {d.recent.map(
          (a: {
            id: string;
            booking_id: string;
            terms_version: number | null;
            snapshot_hash: string;
            listened: boolean;
            accepted_at: string;
          }) => (
            <div key={a.id} className="p-3 flex flex-wrap gap-x-4 gap-y-1">
              <span>{new Date(a.accepted_at).toLocaleString("en-IN")}</span>
              <span>booking {a.booking_id.slice(0, 8)}</span>
              <span>{a.terms_version ? `v${a.terms_version}` : "no terms published"}</span>
              <span className="text-muted-foreground">hash {a.snapshot_hash.slice(0, 10)}…</span>
              {a.listened && (
                <span className="text-xs rounded-full bg-muted px-2 py-0.5">listened</span>
              )}
            </div>
          ),
        )}
      </div>
    </div>
  );
}
