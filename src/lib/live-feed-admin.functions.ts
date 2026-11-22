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

export const listPendingLiveFeedVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("live_feed_videos")
      .select(
        "id, owner_id, storage_path, verification_status, distance_m, random_prompt, duration_seconds, created_at, processing_status, processing_error, myr_listing_id, myr_room_id, property_id, room_id",
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
    const { processLiveVideo, signVideoAssets } = await import("./video-processing.server");
    const ready = await processLiveVideo(supabaseAdmin, data.id);
    return signVideoAssets(supabaseAdmin, ready, 3600);
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
    const patch: import("@/integrations/supabase/types").Database["public"]["Tables"]["live_feed_videos"]["Update"] =
      {
        verification_status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        verification_notes: data.decision === "rejected" ? (data.reason ?? null) : null,
      };
    if (data.decision === "verified") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { processLiveVideo } = await import("./video-processing.server");
      await processLiveVideo(supabaseAdmin, data.id);
      const expires = new Date();
      expires.setDate(expires.getDate() + VERIFICATION_VALIDITY_DAYS);
      patch.expires_at = expires.toISOString();
    }
    const { error } = await supabase.from("live_feed_videos").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- live photos review ----------
export const listPendingLivePhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("live_feed_photos")
      .select(
        "id, owner_id, room_id, property_id, storage_path, verification_status, distance_m, created_at",
      )
      .in("verification_status", ["pending", "flagged"])
      .order("created_at", { ascending: true })
      .limit(200);
    if (error) throw new Error(error.message);
    return {
      items: (data ?? []).map((p) => ({
        ...p,
        url: supabaseAdmin.storage.from("live-feed-photos").getPublicUrl(p.storage_path as string)
          .data.publicUrl as string,
      })),
    };
  });

export const decideLivePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const expires = new Date(Date.now() + VERIFICATION_VALIDITY_DAYS * 864e5).toISOString();
    const { error } = await supabaseAdmin
      .from("live_feed_photos")
      .update({
        verification_status: data.decision,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        expires_at: data.decision === "verified" ? expires : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
