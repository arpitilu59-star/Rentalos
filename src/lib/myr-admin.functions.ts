import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertPropertyAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("admin_users")
    .select("role, active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  const allowed = ["root_owner", "full_admin", "property_admin", "support_admin"];
  if (!allowed.includes(data.role)) throw new Error("Forbidden");
}

export const listMyrVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "verified" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPropertyAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("myr_verifications")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data?.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    // attach user emails
    const ids = Array.from(new Set((rows ?? []).map((r) => r.user_id)));
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id, full_name, email").in("id", ids)
      : { data: [] };
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return { rows: (rows ?? []).map((r: any) => ({ ...r, profile: map.get(r.user_id) ?? null })) };
  });

export const signMyrDocUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { path: string }) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPropertyAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: s, error } = await supabaseAdmin.storage.from("myr-kyc").createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: s.signedUrl };
  });

const DecideSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["verified", "rejected"]),
  reason: z.string().max(500).optional(),
});

export const decideMyrVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPropertyAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("myr_verifications")
      .update({
        status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: data.decision === "rejected" ? data.reason ?? null : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
