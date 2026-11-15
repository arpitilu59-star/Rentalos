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
    <div className="min-w-0 rounded-2xl border border-dashed border-border p-6 sm:p-8 text-center text-muted-foreground">
      {Icon && (
        <span aria-hidden="true">
          <Icon className="size-8 mx-auto mb-2 opacity-50" />
        </span>
      )}
      <div className="text-sm leading-relaxed [overflow-wrap:anywhere]">{title}</div>
      {action && (
        <div className="mt-3 flex flex-wrap justify-center gap-2 [overflow-wrap:anywhere]">
          {action}
        </div>
      )}
    </div>
  );
}
