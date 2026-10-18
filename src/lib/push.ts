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

// ---------- user notification settings ----------
export type Category = "rent" | "bookings" | "maintenance" | "roommate" | "account";
export type Prefs = {
  push_enabled: boolean; rent: boolean; bookings: boolean; maintenance: boolean; roommate: boolean; account: boolean;
  quiet_start: number | null; quiet_end: number | null; tz_offset_min: number;
};
export const DEFAULT_PREFS: Prefs = { push_enabled: true, rent: true, bookings: true, maintenance: true, roommate: true, account: true, quiet_start: null, quiet_end: null, tz_offset_min: 330 };

/** Which settings switch controls a notification kind. Unknown kinds fall under "account" (important, rare). */
export function categoryForKind(kind: string): Category {
  if (/^(bill|payment|rent|meter)/.test(kind)) return "rent";
  if (/^(booking|move_in)/.test(kind)) return "bookings";
  if (/maintenance|ticket/.test(kind)) return "maintenance";
  if (/^roommate/.test(kind)) return "roommate";
  return "account";
}

/** Local hour of `now` in the user's timezone. */
const localHour = (now: Date, tzOffsetMin: number) => new Date(now.getTime() + tzOffsetMin * 60_000).getUTCHours();

export function inQuietHours(p: Pick<Prefs, "quiet_start" | "quiet_end" | "tz_offset_min">, now: Date): boolean {
  if (p.quiet_start == null || p.quiet_end == null || p.quiet_start === p.quiet_end) return false;
  const h = localHour(now, p.tz_offset_min);
  return p.quiet_start < p.quiet_end ? h >= p.quiet_start && h < p.quiet_end : h >= p.quiet_start || h < p.quiet_end;
}

/** send = push now; skip = user turned it off (drop); defer = quiet hours (try again later). */
export function pushDecision(p: Prefs, kind: string, now: Date): "send" | "skip" | "defer" {
  if (!p.push_enabled || !p[categoryForKind(kind)]) return "skip";
  return inQuietHours(p, now) ? "defer" : "send";
}
