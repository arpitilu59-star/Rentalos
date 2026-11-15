/**
 * Shared metric/stat card — used across dashboards. Extracted from the
 * RentDesk dashboard's local version (which was already the right
 * design) so every dashboard (landlord, admin, tenant) shares one
 * implementation instead of each redefining its own copy.
 */
export function StatCard({
  label,
  value,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl bg-card border border-border p-3 sm:p-4 shadow-card">
      <div className="flex items-start justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 break-words">{label}</span>
        <span aria-hidden="true" className="shrink-0">
          <Icon className={`size-4 ${accent ?? "text-muted-foreground"}`} />
        </span>
      </div>
      <div className="mt-2 text-lg sm:text-xl xl:text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">
        {value}
      </div>
    </div>
  );
}
