import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Any ACTIVE admin (root_owner, full_admin, support_admin, property_admin, …)
 * may review verification requests. Authorization is decided here, on the
 * server, from the user id in the validated JWT — never from frontend state.
 * The lookup uses the service role so it can't be silently emptied by RLS.
 */
export type AdminLookupClient = {
  from: (t: string) => {
    select: (c: string) => {
      eq: (
        c: string,
        v: unknown,
      ) => {
        eq: (
          c: string,
          v: unknown,
        ) => {
          maybeSingle: () => PromiseLike<{
            data: { role: string } | null;
            error: { message: string } | null;
          }>;
        };
      };
    };
  };
};

export async function assertActiveAdmin(client: AdminLookupClient, userId: string | undefined) {
  if (!userId) throw new Error("Not signed in. Please log in again.");
  const { data, error } = await client
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("Couldn't verify your admin access. Please try again.");
  if (!data) throw new Error("Admin access required. Your account is not an active admin.");
  return data.role;
}

async function requireAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await assertActiveAdmin(supabaseAdmin as unknown as AdminLookupClient, userId);
  return supabaseAdmin;
}

export const listMyrVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { status?: "pending" | "verified" | "rejected" }) => input)
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await requireAdmin(context.userId);
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
    const supabaseAdmin = await requireAdmin(context.userId);

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
    const { userId } = context;
    const supabaseAdmin = await requireAdmin(userId);

    const { data: existing, error: findErr } = await supabaseAdmin
      .from("myr_verifications")
      .select("id, user_id, kind, status")
      .eq("id", data.id)
      .maybeSingle();
    if (findErr) throw new Error("Couldn't load that verification. Please try again.");
    if (!existing) throw new Error("This verification request no longer exists.");

    const { data: updated, error } = await supabaseAdmin
      .from("myr_verifications")
      .update({
        status: data.decision,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
        rejection_reason: data.decision === "rejected" ? data.reason?.trim() || null : null,
      })
      .eq("id", data.id)
      .select("id, status")
      .maybeSingle();
    if (error) {
      console.error("[myr-verification] decide failed:", error.message);
      throw new Error("Couldn't save the decision: " + error.message);
    }
    if (!updated) throw new Error("The decision was not saved. Please refresh and try again.");

    // Let the landlord know (best-effort; never blocks the decision).
    try {
      await supabaseAdmin.rpc("notify_user", {
        _user: existing.user_id,
        _kind: "verification_update",
        _title: data.decision === "verified" ? "Verification approved" : "Verification rejected",
        _body:
          data.decision === "verified"
            ? "Your documents were approved."
            : data.reason?.trim() || "Please upload clearer documents and try again.",
        _link: "/verify-identity",
      });
    } catch {
      /* notification is optional */
    }
    return { ok: true, id: updated.id, status: updated.status as "verified" | "rejected" };
  });
