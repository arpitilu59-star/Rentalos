import { getAdmin } from "@/lib/whatsapp/db";
import { buildMessages, deadTokens, type PushNotif } from "@/lib/push";

/** Sends not-yet-pushed in-app notifications (last 48 h) to the users' phones via Expo. */
export async function dispatchPendingPush(limit = 200) {
  const admin = await getAdmin();
  const since = new Date(Date.now() - 48 * 3600_000).toISOString();
  const { data } = await admin
    .from("myr_notifications")
    .select("id, user_id, kind, title, body, link")
    .is("push_sent_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(limit);
  const notifs = (data ?? []) as PushNotif[];
  if (!notifs.length) return { scanned: 0, sent: 0, removed: 0 };

  const userIds = [...new Set(notifs.map((n) => n.user_id))];
  const { data: toks } = await admin.from("push_tokens").select("user_id, token").in("user_id", userIds);
  const byUser = new Map<string, string[]>();
  for (const t of (toks ?? []) as { user_id: string; token: string }[]) {
    byUser.set(t.user_id, [...(byUser.get(t.user_id) ?? []), t.token]);
  }
  const messages = buildMessages(notifs, byUser);
  let sent = 0;
  let removed = 0;
  for (let i = 0; i < messages.length; i += 100) {
    const batch = messages.slice(i, i + 100);
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(batch),
    });
    if (!res.ok) throw new Error(`Expo push failed: ${res.status}`);
    const json = (await res.json()) as { data?: Array<{ status: string; details?: { error?: string } }> };
    const tickets = json.data ?? [];
    sent += tickets.filter((t) => t.status === "ok").length;
    const dead = deadTokens(batch, tickets);
    if (dead.length) {
      await admin.from("push_tokens").delete().in("token", dead);
      removed += dead.length;
    }
  }
  // Mark every scanned notification handled (users without a device simply have nothing to push).
  await admin.from("myr_notifications").update({ push_sent_at: new Date().toISOString() }).in("id", notifs.map((n) => n.id));
  return { scanned: notifs.length, sent, removed };
}
