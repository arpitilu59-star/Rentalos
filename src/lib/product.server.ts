/** First-party product analytics + feedback helpers (server only). No PII goes into event props. */
import { getAdmin } from "./whatsapp/db";

export const EVENT_NAMES = [
  "app_open",
  "signup_completed",
  "onboarding_completed",
  "property_created",
  "room_created",
  "tenant_added",
  "bill_created",
  "bill_shared",
  "payment_submitted",
  "payment_verified",
  "feedback_opened",
  "feedback_submitted",
  "push_registered",
] as const;
export type EventName = (typeof EVENT_NAMES)[number];

const ROLES = ["landlord", "tenant", "admin", "unknown"] as const;
const PLATFORMS = ["web", "android", "ios", "server"] as const;
export type Role = (typeof ROLES)[number];

/** Keeps only short scalar props with safe keys — never free text, so no accidental PII. */
export function sanitizeProps(p: unknown): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!p || typeof p !== "object") return out;
  for (const [k, v] of Object.entries(p as Record<string, unknown>).slice(0, 8)) {
    if (!/^[a-z_]{1,30}$/.test(k)) continue;
    if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
    else if (typeof v === "string" && /^[A-Za-z0-9_.\-]{1,40}$/.test(v)) out[k] = v;
  }
  return out;
}

/** Best-effort: analytics must never break a user action. */
export async function trackEvent(
  userId: string | null,
  event: string,
  opts: { role?: string; platform?: string; props?: unknown } = {},
): Promise<void> {
  try {
    if (!(EVENT_NAMES as readonly string[]).includes(event)) return;
    const role = (ROLES as readonly string[]).includes(opts.role ?? "") ? (opts.role as Role) : "unknown";
    const platform = (PLATFORMS as readonly string[]).includes(opts.platform ?? "") ? opts.platform! : "server";
    const admin = await getAdmin();
    await admin.from("product_events").insert({ user_id: userId, role, event, platform, props: sanitizeProps(opts.props) });
  } catch {
    /* ignore */
  }
}

const KINDS = ["bug", "idea", "support", "other"] as const;
export type FeedbackInput = {
  kind: (typeof KINDS)[number];
  body: string;
  screen: string | null;
  platform: "web" | "android" | "ios";
  appVersion: string | null;
  role: Role;
};

export function parseFeedback(b: Record<string, unknown>, role: Role): FeedbackInput {
  const kind = (KINDS as readonly string[]).includes(String(b.kind)) ? (b.kind as FeedbackInput["kind"]) : "other";
  const body = typeof b.body === "string" ? b.body.trim().slice(0, 2000) : "";
  if (body.length < 3) throw new Error("Please write at least a few words.");
  const screen = typeof b.screen === "string" && b.screen.trim() ? b.screen.trim().slice(0, 120) : null;
  const platform = b.platform === "ios" ? "ios" : b.platform === "android" ? "android" : "web";
  const appVersion = typeof b.appVersion === "string" && b.appVersion.trim() ? b.appVersion.trim().slice(0, 40) : null;
  return { kind, body, screen, platform, appVersion, role };
}

/** Max 5 submissions/hour/user so the inbox can't be flooded. */
export async function saveFeedback(userId: string, f: FeedbackInput): Promise<{ id: string }> {
  const admin = await getAdmin();
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin
    .from("feedback_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", since);
  if ((count ?? 0) >= 5) throw new Error("Bahut zyada feedback bheja — thodi der baad try karein.");
  const { data, error } = await admin
    .from("feedback_items")
    .insert({
      user_id: userId,
      role: f.role,
      kind: f.kind,
      body: f.body,
      screen: f.screen,
      platform: f.platform,
      app_version: f.appVersion,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error("Couldn't save feedback. Please try again.");
  await trackEvent(userId, "feedback_submitted", { role: f.role, platform: f.platform, props: { kind: f.kind } });
  return { id: data.id as string };
}
