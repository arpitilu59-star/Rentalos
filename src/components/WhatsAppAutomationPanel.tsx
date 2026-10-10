import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyAutomationStatus } from "@/lib/whatsapp.admin.functions";

/** RentDesk: shows REAL WhatsApp automation state. Renders nothing on error. */
export function WhatsAppAutomationPanel() {
  const fn = useServerFn(getMyAutomationStatus);
  const q = useQuery({ queryKey: ["my-automation"], queryFn: () => fn(), retry: false });
  if (q.isLoading || q.isError || !q.data) return null;
  const d = q.data;
  const state = !d.linked ? "Not linked" : d.optedIn ? "On" : "Paused";
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">WhatsApp automation</h2>
        <span className="text-xs text-muted-foreground">
          {state}
          {d.live ? "" : " · simulated"}
        </span>
      </div>
      {!d.linked ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Link your number in{" "}
          <Link to="/settings" className="underline">
            Settings
          </Link>{" "}
          to get rent and payment updates on WhatsApp.
        </p>
      ) : d.recent.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">No WhatsApp messages sent yet.</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {d.recent.map((r, i) => (
            <li key={i} className="flex justify-between">
              <span>{r.event_type.replace(/_/g, " ")}</span>
              <span
                className={r.status === "failed" ? "text-destructive" : "text-muted-foreground"}
              >
                {r.status}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
