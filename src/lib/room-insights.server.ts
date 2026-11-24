import { randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { getAdmin } from "./whatsapp/db";
import { privateHash, readSmallJson, requestIp, sameSiteRequest } from "./request-safety.server";
import { summarizeInsights, type RoomInsight, type RoomInsights } from "./room-insights";

export const EngagementInput = z.object({
  room_id: z.string().uuid(),
  event: z.enum(["view", "video_complete"]),
});
export function isBotAgent(ua: string) {
  return (
    !ua ||
    /bot|crawler|spider|headless|preview|facebookexternalhit|curl|wget|python|scrapy|monitor/i.test(
      ua,
    )
  );
}
export function visitorFromCookie(value: string | null) {
  if (!value) return null;
  const [id, sig] = value.split(".");
  if (!/^[a-f0-9-]{36}$/.test(id ?? "") || !/^[a-f0-9]{64}$/.test(sig ?? "")) return null;
  const expected = privateHash("visitor-cookie", id);
  return timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) ? id : null;
}
export async function recordEngagement(request: Request, userId: string | null, body: unknown) {
  const parsed = EngagementInput.safeParse(body);
  if (!parsed.success) return Response.json({ error: "Invalid room event" }, { status: 400 });
  if (isBotAgent(request.headers.get("user-agent") ?? "")) return Response.json({ ok: true });
  const admin = await getAdmin();
  const cookie =
    request.headers
      .get("cookie")
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("rentalos_visitor="))
      ?.slice(17) ?? null;
  const visitor = visitorFromCookie(cookie) || randomUUID();
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const viewer = privateHash(`room-view:${day}`, userId ? `user:${userId}` : `visitor:${visitor}`);
  for (const [scope, key, limit, seconds] of [
    ["room-events-ip", privateHash("room-ip", requestIp(request)), 300, 3600],
    ["room-events-viewer", viewer, 240, 86400],
  ] as const) {
    const { data, error } = await admin.rpc("consume_request_limit", {
      _scope: scope,
      _key: key,
      _limit: limit,
      _seconds: seconds,
    });
    if (error || !data) return Response.json({ ok: true }); // Analytics failures never break browsing.
  }
  await admin.rpc("record_room_engagement", {
    _room: parsed.data.room_id,
    _viewer: viewer,
    _user: userId,
    _kind: parsed.data.event,
  });
  const headers: Record<string, string> = { "cache-control": "no-store" };
  if (!userId)
    headers["set-cookie"] =
      `rentalos_visitor=${visitor}.${privateHash("visitor-cookie", visitor)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=7776000${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`;
  return Response.json({ ok: true }, { headers });
}
export async function handlePublicEngagement(request: Request) {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!sameSiteRequest(request)) return new Response(null, { status: 403 });
  try {
    const { userFromRequest } = await import("./mobile-api.server");
    const userId = await userFromRequest(request);
    if (request.headers.has("authorization") && !userId) return new Response(null, { status: 401 });
    return await recordEngagement(request, userId, await readSmallJson(request, 1500));
  } catch {
    return Response.json({ ok: true });
  }
}
export async function getOwnerInsights(userId: string): Promise<RoomInsights> {
  const a = await getAdmin();
  const { isLandlord } = await import("./mobile-landlord.server");
  if (!(await isLandlord(a, userId))) throw new Error("Landlord access required.");
  const [{ data, error }, { data: p }] = await Promise.all([
    a.rpc("room_insight_counts", { _owner: userId, _days: 7 }),
    a
      .from("room_insight_preferences")
      .select("summary_frequency,signals_enabled")
      .eq("owner_id", userId)
      .maybeSingle(),
  ]);
  if (error) throw new Error("Insights could not load. Please try again.");
  const rooms = (data ?? []) as RoomInsight[];
  return {
    rooms,
    totals: summarizeInsights(rooms),
    preferences: p ?? { summary_frequency: "weekly", signals_enabled: true },
  };
}
export async function saveInsightPreferences(userId: string, input: unknown) {
  const prefs = z
    .object({ summary_frequency: z.enum(["daily", "weekly", "off"]), signals_enabled: z.boolean() })
    .parse(input);
  const a = await getAdmin();
  const { isLandlord } = await import("./mobile-landlord.server");
  if (!(await isLandlord(a, userId))) throw new Error("Landlord access required.");
  const { error } = await a.from("room_insight_preferences").upsert({ owner_id: userId, ...prefs });
  if (error) throw new Error("Preferences could not save.");
  return { ok: true };
}
