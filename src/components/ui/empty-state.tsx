/**
 * Shared empty-state pattern — dashed border, icon, message, optional
 * action. Currently hand-rolled slightly differently on nearly every
 * page ("No rooms yet", "Koi tenant nahi mila", "Nothing pending
 * review", etc.) — one shared version so spacing/sizing/tone stays
 * consistent everywhere.
 */
export function EmptyState({
  icon: Icon,
  title,
  action,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border p-8 text-center text-muted-foreground">
      {Icon && <Icon className="size-8 mx-auto mb-2 opacity-50" />}
      <div className="text-sm">{title}</div>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
