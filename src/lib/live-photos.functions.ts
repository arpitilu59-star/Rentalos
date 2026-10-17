import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireEntitlement } from "@/lib/subscription/entitlements";
import { getAdmin } from "@/lib/whatsapp/db";

const MAX_DISTANCE_M = 50;
const VALID_DAYS = 150;
const MAX_PHOTOS_PER_TARGET = 12;

const Target = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("room"), id: z.string().uuid() }),
  z.object({ kind: z.literal("property"), id: z.string().uuid() }),
]);

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const a =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Registers a camera photo (already uploaded by the browser). Within 50 m of the property → live-verified at once. */
export const submitLivePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        target: Target,
        storage_path: z.string().min(10).max(300),
        captured_lat: z.number().min(-90).max(90),
        captured_lng: z.number().min(-180).max(180),
        caption: z.string().trim().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireEntitlement(userId, "live_feed_video");
    if (!data.storage_path.startsWith(`${userId}/`)) throw new Error("Invalid photo path.");

    let lat: number | null = null;
    let lng: number | null = null;
    if (data.target.kind === "room") {
      const { data: r } = await supabase
        .from("rooms")
        .select("id, properties(latitude, longitude)")
        .eq("id", data.target.id)
        .maybeSingle();
      if (!r) throw new Error("Room not found or not yours.");
      const p = (r as unknown as { properties: { latitude: number | null; longitude: number | null } | null })
        .properties;
      lat = p?.latitude ?? null;
      lng = p?.longitude ?? null;
    } else {
      const { data: p } = await supabase
        .from("properties")
        .select("id, latitude, longitude")
        .eq("id", data.target.id)
        .maybeSingle();
      if (!p) throw new Error("Property not found or not yours.");
      lat = (p.latitude as number | null) ?? null;
      lng = (p.longitude as number | null) ?? null;
    }

    const admin = await getAdmin();
    const col = data.target.kind === "room" ? "room_id" : "property_id";
    const { count } = await admin
      .from("live_feed_photos")
      .select("id", { count: "exact", head: true })
      .eq(col, data.target.id)
      .neq("verification_status", "rejected");
    if ((count ?? 0) >= MAX_PHOTOS_PER_TARGET)
      throw new Error(`You can add up to ${MAX_PHOTOS_PER_TARGET} live photos. Delete one to add another.`);

    const distance = lat != null && lng != null ? haversineMeters(data.captured_lat, data.captured_lng, lat, lng) : null;
    const status = distance == null ? "pending" : distance <= MAX_DISTANCE_M ? "verified" : "flagged";
    const expires = status === "verified" ? new Date(Date.now() + VALID_DAYS * 864e5).toISOString() : null;

    const { data: row, error } = await admin
      .from("live_feed_photos")
      .insert({
        owner_id: userId,
        [col]: data.target.id,
        storage_path: data.storage_path,
        caption: data.caption ?? null,
        captured_lat: data.captured_lat,
        captured_lng: data.captured_lng,
        distance_m: distance,
        verification_status: status,
        expires_at: expires,
        reviewed_at: status === "verified" ? new Date().toISOString() : null,
      })
      .select("id, verification_status, distance_m")
      .single();
    if (error) throw new Error("Couldn't save the photo. Please try again.");
    return row as { id: string; verification_status: string; distance_m: number | null };
  });

export const listMyLivePhotos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ target: Target }).parse(d))
  .handler(async ({ data, context }) => {
    const col = data.target.kind === "room" ? "room_id" : "property_id";
    const { data: rows, error } = await context.supabase
      .from("live_feed_photos")
      .select("id, storage_path, verification_status, distance_m, created_at")
      .eq(col, data.target.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("Couldn't load your photos.");
    const admin = await getAdmin();
    return (rows ?? []).map((r) => ({
      ...r,
      url: admin.storage.from("live-feed-photos").getPublicUrl(r.storage_path as string).data.publicUrl as string,
    }));
  });

export const deleteLivePhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase.from("live_feed_photos").select("storage_path").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Photo not found.");
    const { error } = await supabase.from("live_feed_photos").delete().eq("id", data.id);
    if (error) throw new Error("Couldn't delete the photo.");
    await supabase.storage.from("live-feed-photos").remove([row.storage_path as string]);
    return { ok: true };
  });

/** Public: verified, unexpired live photos of a room (falls back to nothing, never to unverified ones). */
export const listRoomLivePhotos = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ roomId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const anon = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: rows } = await anon
      .from("live_feed_photos")
      .select("id, storage_path, created_at")
      .eq("room_id", data.roomId)
      .eq("verification_status", "verified")
      .order("created_at", { ascending: true })
      .limit(12);
    return (rows ?? []).map((r: { id: string; storage_path: string; created_at: string }) => ({
      id: r.id,
      created_at: r.created_at,
      url: anon.storage.from("live-feed-photos").getPublicUrl(r.storage_path).data.publicUrl,
    }));
  });
