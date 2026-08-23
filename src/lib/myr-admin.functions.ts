import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const map = new Map(
      (profs ?? []).map((p: { id: string; full_name: string | null; email: string | null }) => [
        p.id,
        p,
      ]),
    );
    return {
      rows: (rows ?? []).map((r: Record<string, unknown>) => ({
        ...r,
        profile: map.get(r.user_id as string) ?? null,
      })),
    };
  });

const SignDocSchema = z.object({
  verification_id: z.string().uuid(),
  field: z.enum(["id_doc", "selfie", "property_doc"]),
});

export const signMyrDocUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SignDocSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertPropertyAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const col = { id_doc: "id_doc_path", selfie: "selfie_path", property_doc: "property_doc_path" }[
      data.field
    ];
    const { data: row, error: rowErr } = await supabaseAdmin
      .from("myr_verifications")
      .select(col)
      .eq("id", data.verification_id)
      .maybeSingle();
    if (rowErr) throw new Error(rowErr.message);
    // Only ever sign a path that's actually stored on this specific
    // verification row — an admin (or a compromised admin session) can't
    // pass in an arbitrary storage path and get it signed.
    const path = (row as Record<string, string | null> | null)?.[col];
    if (!path) throw new Error("Document not uploaded.");

    const { data: s, error } = await supabaseAdmin.storage
      .from("myr-kyc")
      .createSignedUrl(path, 600);
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
        rejection_reason: data.decision === "rejected" ? (data.reason ?? null) : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
