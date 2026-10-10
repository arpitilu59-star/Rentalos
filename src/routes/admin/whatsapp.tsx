import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { getWhatsAppOverview } from "@/lib/whatsapp.admin.functions";

export const Route = createFileRoute("/admin/whatsapp")({ component: WhatsAppAdmin });

function Flag({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
      <span>{label}</span>
      <span className={ok ? "text-emerald-600" : "text-amber-600"}>{ok ? "Set" : "Not set"}</span>
    </li>
  );
}

function WhatsAppAdmin() {
  const fn = useServerFn(getWhatsAppOverview);
  const q = useQuery({ queryKey: ["admin-whatsapp"], queryFn: () => fn(), retry: false });

  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.isError || !q.data)
    return (
      <p className="text-sm text-destructive">Couldn't load WhatsApp activity. Refresh to retry.</p>
    );
  const d = q.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Delivery mode:{" "}
          <b>
            {d.live
              ? "Live (Meta credentials present)"
              : "Simulated — no messages leave the server"}
          </b>
        </p>
      </div>

      <ul className="grid gap-2 sm:grid-cols-3">
        <Flag ok={d.live} label="Access token + phone number ID" />
        <Flag ok={d.verifyTokenSet} label="Webhook verify token" />
        <Flag ok={d.webhookSecretSet} label="App secret (signature check)" />
        <Flag ok={d.dispatchSecretSet} label="Dispatch scheduler secret" />
      </ul>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Linked users", d.linkedUsers],
          ["Opted in", d.optedInUsers],
          ...Object.entries(d.counts).map(([k, v]) => [`${k} (7d)`, v] as [string, number]),
        ].map(([label, v]) => (
          <div key={String(label)} className="rounded-xl border p-4">
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-2">Time</th>
              <th className="p-2">Dir</th>
              <th className="p-2">Event</th>
              <th className="p-2">Status</th>
              <th className="p-2">Tries</th>
              <th className="p-2">Reason</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.length === 0 && (
              <tr>
                <td colSpan={6} className="p-4 text-center text-muted-foreground">
                  No WhatsApp activity in the last 7 days.
                </td>
              </tr>
            )}
            {d.recent.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="p-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                <td className="p-2">{r.direction}</td>
                <td className="p-2">{r.event_type}</td>
                <td className={`p-2 ${r.status === "failed" ? "text-destructive" : ""}`}>
                  {r.status}
                </td>
                <td className="p-2">{r.attempts}</td>
                <td className="p-2 max-w-[260px] truncate" title={r.failure_reason ?? ""}>
                  {r.failure_reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
