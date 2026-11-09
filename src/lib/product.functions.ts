import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase.from("admin_users").select("id").eq("user_id", userId).eq("active", true).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function roleOf(_supabase: any, userId: string): Promise<"landlord" | "tenant"> {
  const { getAdmin } = await import("./whatsapp/db");
  const { isLandlord } = await import("./mobile-landlord.server");
  return (await isLandlord(await getAdmin(), userId)) ? "landlord" : "tenant";
}

export const trackProductEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ event: z.string().max(60), props: z.record(z.string(), z.any()).optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { trackEvent } = await import("./product.server");
    await trackEvent(context.userId, data.event, { role: await roleOf(context.supabase, context.userId), platform: "web", props: data.props });
    return { ok: true };
  });

export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ kind: z.enum(["bug", "idea", "support", "other"]), body: z.string().min(3).max(2000), screen: z.string().max(120).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const P = await import("./product.server");
    return P.saveFeedback(context.userId, P.parseFeedback({ ...data, platform: "web" }, await roleOf(context.supabase, context.userId)));
  });

export const adminListFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ status: z.enum(["open", "in_progress", "resolved", "wont_fix", "all"]).default("open") }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    let q = admin
      .from("feedback_items")
      .select("id, role, kind, body, screen, platform, app_version, status, admin_notes, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error("Couldn't load feedback.");
    return { items: rows ?? [] };
  });

export const adminUpdateFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ id: z.string().uuid(), status: z.enum(["open", "in_progress", "resolved", "wont_fix"]), notes: z.string().max(2000).optional() }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    const patch: Record<string, unknown> = { status: data.status, updated_at: new Date().toISOString() };
    if (data.notes !== undefined) patch.admin_notes = data.notes;
    const { error } = await admin.from("feedback_items").update(patch).eq("id", data.id);
    if (error) throw new Error("Couldn't update.");
    return { ok: true };
  });

/** Admin: activation funnel + event counts for the last N days (distinct users per step). */
export const adminFunnel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ days: z.number().int().min(1).max(90).default(30) }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    const since = new Date(Date.now() - data.days * 86400_000).toISOString();
    const { data: rows, error } = await admin
      .from("product_events")
      .select("user_id, event, role")
      .gte("created_at", since)
      .limit(50000);
    if (error) throw new Error("Couldn't load analytics.");
    const users: Record<string, Set<string>> = {};
    const totals: Record<string, number> = {};
    for (const r of (rows ?? []) as { user_id: string | null; event: string }[]) {
      totals[r.event] = (totals[r.event] ?? 0) + 1;
      if (r.user_id) (users[r.event] ??= new Set()).add(r.user_id);
    }
    const steps = ["signup_completed", "onboarding_completed", "property_created", "room_created", "tenant_added", "bill_created", "payment_verified"];
    return {
      days: data.days,
      truncated: (rows?.length ?? 0) >= 50000,
      funnel: steps.map((e) => ({ event: e, users: users[e]?.size ?? 0 })),
      totals,
      activeUsers: new Set((rows ?? []).map((r: { user_id: string | null }) => r.user_id).filter(Boolean)).size,
    };
  });
