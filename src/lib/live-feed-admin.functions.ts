import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

const VERIFICATION_VALIDITY_DAYS = 150;

// Admin review queue — this is the piece that was completely missing
// before: videos got recorded but no one (human or automatic) ever
// actually decided whether they counted as "verified".
export const listPendingLiveFeedVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // RLS already grants admins read access to all live_feed_videos rows
    // ("admins read all live feed videos" policy), so the authenticated
    // client is enough here — no need for the service-role client.
    const { data, error } = await supabase
      .from("live_feed_videos")
      .select(
        "id, owner_id, storage_path, verification_status, distance_m, random_prompt, duration_seconds, created_at, myr_listing_id, myr_room_id, property_id, room_id",
      )
      .in("verification_status", ["pending", "flagged"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

export const signLiveFeedVideoForAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("live_feed_videos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Not found");
    const { data: sig, error } = await supabaseAdmin.storage
      .from("live-feed-videos")
      .createSignedUrl(row.storage_path, 900);
    if (error) throw new Error(error.message);
    return { url: sig.signedUrl };
  });

const DecideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().max(500).optional(),
});

export const decideLiveFeedVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch: Record<string, unknown> = {
      verification_status: data.decision,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
      verification_notes: data.decision === "rejected" ? (data.reason ?? null) : null,
    };
    if (data.decision === "verified") {
      const expires = new Date();
      expires.setDate(expires.getDate() + VERIFICATION_VALIDITY_DAYS);
      patch.expires_at = expires.toISOString();
    }
    // RLS "admins update live feed videos" policy already permits this via
    // the authenticated client.
    const { error } = await supabase.from("live_feed_videos").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
