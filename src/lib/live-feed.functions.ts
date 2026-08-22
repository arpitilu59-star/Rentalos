import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

export type LiveFeedTarget =
  | { kind: "myr_listing"; id: string }
  | { kind: "myr_room"; id: string }
  | { kind: "property"; id: string }
  | { kind: "room"; id: string };

const MAX_DISTANCE_M = 50;

function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

export const submitLiveVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      target: LiveFeedTarget;
      storage_path: string;
      captured_lat: number;
      captured_lng: number;
      random_prompt: string;
      duration_seconds: number;
      mime_type?: string;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const {
      target,
      storage_path,
      captured_lat,
      captured_lng,
      random_prompt,
      duration_seconds,
      mime_type,
    } = data;

    if (duration_seconds < 5 || duration_seconds > 45) {
      throw new Error("Video duration must be 5-45 seconds.");
    }

    let target_lat: number | null = null;
    let target_lng: number | null = null;
    const targetCol: Record<LiveFeedTarget["kind"], string> = {
      myr_listing: "myr_listing_id",
      myr_room: "myr_room_id",
      property: "property_id",
      room: "room_id",
    };

    if (target.kind === "property") {
      const { data: p, error } = await supabase
        .from("properties")
        .select("id, latitude, longitude")
        .eq("id", target.id)
        .maybeSingle();
      if (error || !p) throw new Error("Property not found or not yours");
      target_lat = p.latitude as number | null;
      target_lng = p.longitude as number | null;
    } else if (target.kind === "room") {
      const { data: r, error } = await supabase
        .from("rooms")
        .select("id, property_id, properties(latitude, longitude)")
        .eq("id", target.id)
        .maybeSingle();
      if (error || !r) throw new Error("Room not found or not yours");
      const prop = (
        r as unknown as { properties: { latitude: number | null; longitude: number | null } | null }
      ).properties;
      target_lat = prop?.latitude ?? null;
      target_lng = prop?.longitude ?? null;
    } else if (target.kind === "myr_listing") {
      const { data: l, error } = await supabase
        .from("myr_listings")
        .select("id, landlord_id")
        .eq("id", target.id)
        .maybeSingle();
      if (error || !l) throw new Error("Listing not found or not yours");
    } else if (target.kind === "myr_room") {
      const { data: r, error } = await supabase
        .from("myr_listing_rooms")
        .select("id, listing_id")
        .eq("id", target.id)
        .maybeSingle();
      if (error || !r) throw new Error("Room not found or not yours");
    }

    let distance_m: number | null = null;
    let verification_status: "pending" | "verified" | "flagged" = "pending";
    if (target_lat != null && target_lng != null) {
      distance_m = haversineMeters(captured_lat, captured_lng, target_lat, target_lng);
      if (distance_m > MAX_DISTANCE_M) verification_status = "flagged";
    }

    const insertRow = {
      owner_id: userId,
      storage_path,
      mime_type: mime_type ?? "video/webm",
      duration_seconds: Math.round(duration_seconds),
      captured_lat,
      captured_lng,
      target_lat,
      target_lng,
      distance_m,
      random_prompt,
      verification_status,
      [targetCol[target.kind]]: target.id,
    } as unknown as Database["public"]["Tables"]["live_feed_videos"]["Insert"];

    const { data: row, error: insErr } = await supabase
      .from("live_feed_videos")
      .insert(insertRow)
      .select("id, verification_status, distance_m")
      .single();
    if (insErr) throw insErr;

    return {
      id: row.id as string,
      status: row.verification_status as string,
      distance_m: row.distance_m as number | null,
    };
  });

export const listMyLiveVideos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { target: LiveFeedTarget }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const col = {
      myr_listing: "myr_listing_id",
      myr_room: "myr_room_id",
      property: "property_id",
      room: "room_id",
    }[data.target.kind];
    const { data: rows, error } = await supabase
      .from("live_feed_videos")
      .select(
        "id, storage_path, verification_status, distance_m, random_prompt, duration_seconds, created_at",
      )
      .eq(col, data.target.id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return rows ?? [];
  });

export const deleteLiveVideo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: row } = await supabase
      .from("live_feed_videos")
      .select("storage_path")
      .eq("id", data.id)
      .maybeSingle();
    if (row?.storage_path) {
      await supabase.storage.from("live-feed-videos").remove([row.storage_path]);
    }
    const { error } = await supabase.from("live_feed_videos").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const getVerifiedVideoUrl = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: row } = await supabasePublic
      .from("live_feed_videos")
      .select("storage_path, verification_status, expires_at")
      .eq("id", data.id)
      .maybeSingle();
    const notExpired = row?.expires_at ? new Date(row.expires_at).getTime() > Date.now() : false;
    if (!row || row.verification_status !== "verified" || !notExpired)
      return { url: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sig } = await supabaseAdmin.storage
      .from("live-feed-videos")
      .createSignedUrl(row.storage_path, 3600);
    return { url: sig?.signedUrl ?? null };
  });

export const getCoverVideoId = createServerFn({ method: "GET" })
  .inputValidator((d: { target: LiveFeedTarget }) => d)
  .handler(async ({ data }) => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const col = {
      myr_listing: "myr_listing_id",
      myr_room: "myr_room_id",
      property: "property_id",
      room: "room_id",
    }[data.target.kind];
    const nowIso = new Date().toISOString();
    const { data: row } = await supabasePublic
      .from("live_feed_videos")
      .select("id, reviewed_at, created_at")
      .eq(col, data.target.id)
      .eq("verification_status", "verified")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      id: (row?.id as string | undefined) ?? null,
      verifiedAt:
        (row?.reviewed_at as string | undefined) ?? (row?.created_at as string | undefined) ?? null,
    };
  });

// Owner-only — lets the recording's owner watch their OWN video regardless
// of verification_status (pending / flagged / verified / rejected).
// Deliberately separate from getVerifiedVideoUrl (public path) rather than
// adding a bypass flag to it, so the public function's guarantees never
// change. Ownership is checked twice, on purpose:
//   1. Implicitly — the "owner manages own live feed videos" RLS policy
//      already means this select only ever returns a row if it's yours.
//   2. Explicitly — we re-check row.owner_id === userId after the fetch,
//      so a missing/renamed RLS policy would fail closed (empty result),
//      never silently grant access to someone else's video.
// The signed URL itself still comes from the service-role client (same
// pattern already used for admin review), since that's the reliable way
// to sign a private-bucket object regardless of storage RLS nuances.
export const getOwnLiveFeedVideoUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("live_feed_videos")
      .select("id, owner_id, storage_path, verification_status")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Video not found.");
    if (row.owner_id !== userId)
      throw new Error("Forbidden — this recording does not belong to you.");
    if (!row.storage_path)
      throw new Error("This recording has no stored file (upload may have failed).");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sig, error: signErr } = await supabaseAdmin.storage
      .from("live-feed-videos")
      .createSignedUrl(row.storage_path, 900);
    if (signErr || !sig?.signedUrl) {
      // Don't leak storage internals to the client — log server-side only.
      console.error("getOwnLiveFeedVideoUrl: failed to sign", {
        id: data.id,
        storage_path: row.storage_path,
        signErr,
      });
      throw new Error(
        "Could not load this video right now — the file may be missing. Try again or contact support.",
      );
    }
    return { url: sig.signedUrl, status: row.verification_status as string };
  });
