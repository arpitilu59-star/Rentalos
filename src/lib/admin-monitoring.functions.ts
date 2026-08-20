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

/* ============ Fraud flags ============ */

export const listFraudFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: flags }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("fraud_flags")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
      supabaseAdmin.from("profiles").select("id, full_name, email, phone"),
    ]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      items: (flags ?? []).map((f) => ({
        ...f,
        profile: map.get(f.user_id) ?? null,
      })),
    };
  });

export const detectDuplicates = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: tenants } = await supabaseAdmin
      .from("tenants")
      .select("id, name, phone, owner_id");
    const seen = new Map<string, string[]>();
    for (const t of tenants ?? []) {
      const key = (t.phone || "").trim();
      if (!key) continue;
      const arr = seen.get(key) ?? [];
      arr.push(t.id);
      seen.set(key, arr);
    }
    let inserted = 0;
    for (const [phone, ids] of seen) {
      if (ids.length < 2) continue;
      // pick the first tenant's owner_id to attach the flag, dedupe per phone
      const t0 = (tenants ?? []).find((x) => x.id === ids[0])!;
      const { data: existing } = await supabaseAdmin
        .from("fraud_flags")
        .select("id")
        .eq("kind", "duplicate_phone")
        .contains("details", { phone })
        .maybeSingle();
      if (existing) continue;
      await supabaseAdmin.from("fraud_flags").insert({
        user_id: t0.owner_id,
        kind: "duplicate_phone",
        severity: "medium",
        details: { phone, tenant_ids: ids },
        flagged_by: userId,
      });
      inserted++;
    }
    return { inserted };
  });

// #4 — duplicate-photo detection. Rooms/landlords record a fingerprint
// (SHA-256 hash) per photo on upload into photo_fingerprints; this scans
// for the same hash appearing under more than one distinct owner, which
// means the same exact image file is being reused across different
// landlords' listings — a strong stock-photo / fake-listing signal.
export const detectDuplicatePhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: fingerprints } = await supabaseAdmin
      .from("photo_fingerprints")
      .select("hash, room_id, owner_id");

    const byHash = new Map<string, { room_id: string; owner_id: string }[]>();
    for (const f of fingerprints ?? []) {
      const arr = byHash.get(f.hash) ?? [];
      arr.push({ room_id: f.room_id, owner_id: f.owner_id });
      byHash.set(f.hash, arr);
    }

    let inserted = 0;
    for (const [hash, rows] of byHash) {
      const distinctOwners = new Set(rows.map((r) => r.owner_id));
      if (distinctOwners.size < 2) continue; // same owner reusing their own photo is fine
      const { data: existing } = await supabaseAdmin
        .from("fraud_flags")
        .select("id")
        .eq("kind", "duplicate_photo")
        .contains("details", { hash })
        .maybeSingle();
      if (existing) continue;
      await supabaseAdmin.from("fraud_flags").insert({
        user_id: rows[0].owner_id,
        kind: "duplicate_photo",
        severity: "high",
        details: { hash, rooms: rows },
        flagged_by: userId,
      });
      inserted++;
    }
    return { inserted };
  });

const ResolveInput = z.object({ id: z.string().uuid(), resolved: z.boolean() });
export const resolveFraudFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ResolveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("fraud_flags")
      .update({
        resolved: data.resolved,
        resolved_by: data.resolved ? userId : null,
        resolved_at: data.resolved ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Activity feed ============ */

export const listRecentActivity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [{ data: events }, { data: profiles }] = await Promise.all([
      supabaseAdmin
        .from("activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(300),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
    ]);
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));
    return {
      items: (events ?? []).map((e) => ({ ...e, profile: map.get(e.user_id) ?? null })),
    };
  });
