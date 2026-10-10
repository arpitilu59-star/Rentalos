/**
 * Bridges existing in-app notifications (created by DB triggers and pg_cron
 * jobs: bill reminders, payments, lease expiry…) to WhatsApp.
 * Called by /api/whatsapp/dispatch (shared-secret protected) on a schedule.
 * Idempotent: each notification id can be sent at most once.
 */
import { eventForNotificationKind } from "./templates";
import { sendWhatsAppNotification } from "./service";

export type DispatchSummary = {
  scanned: number;
  sent: number;
  mocked: number;
  skipped: number;
  failed: number;
};

export async function dispatchPendingNotifications(limit = 100): Promise<DispatchSummary> {
  const summary: DispatchSummary = { scanned: 0, sent: 0, mocked: 0, skipped: 0, failed: 0 };
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - 48 * 3600_000).toISOString();
    const { data, error } = await supabaseAdmin
      .from("myr_notifications")
      .select("id, user_id, kind, title, body")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(Math.min(Math.max(limit, 1), 500));
    if (error) throw new Error(error.message);

    for (const n of data ?? []) {
      summary.scanned++;
      try {
        const event = eventForNotificationKind(n.kind);
        if (!event) {
          summary.skipped++;
          continue;
        }
        const out = await sendWhatsAppNotification({
          userId: n.user_id,
          event,
          entityId: n.id,
          periodKey: "v1",
          params: [n.title.slice(0, 60), (n.body ?? "Open Rentalos for details").slice(0, 200)],
        });
        if (out.status === "sent") summary.sent++;
        else if (out.status === "mocked") summary.mocked++;
        else if (out.status === "skipped") summary.skipped++;
        else summary.failed++;
      } catch (e) {
        summary.failed++;
        console.error("[whatsapp] dispatch item failed:", e instanceof Error ? e.message : e);
      }
    }
  } catch (e) {
    console.error("[whatsapp] dispatch failed:", e instanceof Error ? e.message : e);
    throw e;
  }
  return summary;
}
