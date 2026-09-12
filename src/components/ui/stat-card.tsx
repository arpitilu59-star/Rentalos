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
    <div className="rounded-2xl bg-card border border-border p-4 shadow-card">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{label}</span>
        <Icon className={`size-4 ${accent ?? "text-muted-foreground"}`} />
      </div>
      <div className="mt-2 text-xl md:text-2xl font-semibold">{value}</div>
    </div>
  );
}
