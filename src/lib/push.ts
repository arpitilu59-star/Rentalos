/** Pure helpers for Expo push messages (unit-tested). */
export type PushNotif = { id: string; user_id: string; kind: string; title: string; body: string | null; link: string | null };
export type ExpoMessage = { to: string; title: string; body: string; sound: "default"; channelId: string; data: { link: string | null; kind: string; id: string } };

export const isExpoToken = (t: string): boolean => /^(Expo|Exponent)PushToken\[[\w-]{10,}\]$/.test(t);

/** One message per notification per device token; invalid tokens are dropped. */
export function buildMessages(notifs: PushNotif[], tokensByUser: Map<string, string[]>): ExpoMessage[] {
  const out: ExpoMessage[] = [];
  for (const n of notifs) {
    for (const to of tokensByUser.get(n.user_id) ?? []) {
      if (!isExpoToken(to)) continue;
      out.push({
        to,
        title: n.title.slice(0, 80),
        body: (n.body ?? "").slice(0, 180),
        sound: "default",
        channelId: "default",
        data: { link: n.link, kind: n.kind, id: n.id },
      });
    }
  }
  return out;
}

/** Tokens Expo reports as unregistered must be deleted so we stop sending to dead devices. */
export function deadTokens(messages: ExpoMessage[], tickets: Array<{ status: string; details?: { error?: string } }>): string[] {
  const dead: string[] = [];
  tickets.forEach((t, i) => {
    if (t.status === "error" && t.details?.error === "DeviceNotRegistered" && messages[i]) dead.push(messages[i].to);
  });
  return dead;
}
