import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// #6 — "Report mismatch": reuses the existing fraud_flags table, so
// reports show up automatically in the admin fraud queue that already
// exists (/admin/fraud) — no new admin screen needed for this one.
const ReportMismatchSchema = z.object({
  room_id: z.string().uuid(),
  note: z.string().min(5).max(1000),
});

export const reportMismatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReportMismatchSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: room } = await supabase
      .from("rooms")
      .select("id, owner_id")
      .eq("id", data.room_id)
      .maybeSingle();
    if (!room) throw new Error("Room not found");

    const { error } = await supabase.from("fraud_flags").insert({
      user_id: room.owner_id,
      kind: "mismatch_report",
      severity: "medium",
      details: { room_id: data.room_id, note: data.note },
      flagged_by: userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// #7 — post-visit review, gated to tenants with an accepted booking for
// that specific room (enforced again here, in addition to the RLS policy,
// so the error message is clear rather than a raw RLS denial).
const SubmitReviewSchema = z.object({
  room_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional(),
  matched_expectations: z.boolean(),
});

export const submitRoomReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SubmitReviewSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: booking } = await supabase
      .from("bookings")
      .select("id")
      .eq("room_id", data.room_id)
      .eq("tenant_user_id", userId)
      .eq("status", "accepted")
      .maybeSingle();
    if (!booking)
      throw new Error(
        "Sirf un rooms ke liye review de sakte hain jinki booking accept ho chuki hai.",
      );

    const { error } = await supabase.from("room_reviews").upsert(
      {
        room_id: data.room_id,
        tenant_user_id: userId,
        rating: data.rating,
        body: data.body ?? null,
        matched_expectations: data.matched_expectations,
      },
      { onConflict: "room_id,tenant_user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRoomReviews = createServerFn({ method: "GET" })
  .inputValidator((d: { room_id: string }) => d)
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const supabasePublic = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
      },
    );
    const { data: rows, error } = await supabasePublic
      .from("room_reviews")
      .select("id, rating, body, matched_expectations, created_at")
      .eq("room_id", data.room_id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    const matchedCount = (rows ?? []).filter((r) => r.matched_expectations === true).length;
    const withAnswer = (rows ?? []).filter((r) => r.matched_expectations !== null).length;
    return {
      reviews: rows ?? [],
      matchedPct: withAnswer > 0 ? Math.round((matchedCount / withAnswer) * 100) : null,
    };
  });

// #4 support — call this from wherever a landlord uploads a room photo,
// right after the file finishes uploading to storage. Pass a SHA-256 hex
// hash of the file (see hashFile() in src/lib/photo-hash.ts — Web Crypto
// API, no library, free). This is intentionally "fire and forget" from
// the caller's point of view: it never blocks or fails the actual photo
// upload, it just quietly builds the fingerprint index admins scan later.
const RecordFingerprintSchema = z.object({
  room_id: z.string().uuid(),
  hash: z.string().min(32).max(128),
});

export const recordPhotoFingerprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RecordFingerprintSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("photo_fingerprints")
      .upsert(
        { hash: data.hash, room_id: data.room_id, owner_id: userId },
        { onConflict: "hash,room_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });
