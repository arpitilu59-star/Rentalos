/**
 * Shared page-header pattern — title + subtitle + optional right-side
 * action. Every RentDesk/admin page currently hand-rolls this as its
 * own <div><h1>...</h1><p>...</p></div>, each slightly different
 * (different heading sizes, different spacing). This is the one
 * canonical version everything should use instead.
 */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: React.ReactNode;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 flex-wrap mb-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
