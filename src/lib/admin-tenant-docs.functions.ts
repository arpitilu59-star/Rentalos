/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";
import { ADMIN_BOOKING_ROLES } from "@/lib/admin-bookings.functions";

async function requireDocAdmin(userId: string) {
  const admin = (await getAdmin()) as any;
  const { data, error } = await admin.from("admin_users").select("id, role").eq("user_id", userId).eq("active", true).maybeSingle();
  if (error) throw new Error("Couldn't verify your admin access. Please try again.");
  if (!data) throw new Error("Admin access required.");
  if (!(ADMIN_BOOKING_ROLES as readonly string[]).includes(data.role)) throw new Error("Your admin role isn't allowed to review documents.");
  return admin;
}

/** Admin: tenant ID documents to review, each with a short-lived signed link to the image. */
export const adminListTenantDocs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ status: z.enum(["pending", "verified", "rejected"]).default("pending") }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const admin = await requireDocAdmin(context.userId);
    const { data: rows, error } = await admin
      .from("tenant_documents")
      .select("id, user_id, doc_type, storage_path, status, admin_note, created_at, reviewed_at")
      .eq("status", data.status)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw new Error("Couldn't load documents.");
    const list = (rows ?? []) as any[];
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    const { data: profs } = ids.length ? await admin.from("profiles").select("id, full_name, mobile, email").in("id", ids) : { data: [] };
    const pm = new Map(((profs ?? []) as any[]).map((p) => [p.id, p]));
    const out = [];
    for (const r of list) {
      const { data: sig } = await admin.storage.from("tenant-docs").createSignedUrl(r.storage_path, 600);
      const p = pm.get(r.user_id);
      out.push({
        id: r.id as string,
        docType: r.doc_type as string,
        status: r.status as string,
        note: (r.admin_note as string | null) ?? null,
        createdAt: r.created_at as string,
        name: (p?.full_name as string | null) ?? null,
        mobile: (p?.mobile as string | null) ?? null,
        email: (p?.email as string | null) ?? null,
        url: (sig?.signedUrl as string | undefined) ?? null,
      });
    }
    return out;
  });

export const adminReviewTenantDoc = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), decision: z.enum(["verified", "rejected"]), note: z.string().trim().max(300).optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await requireDocAdmin(context.userId);
    if (data.decision === "rejected" && !data.note) throw new Error("Write a short reason so the tenant can fix it.");
    const { data: row, error } = await admin
      .from("tenant_documents")
      .update({ status: data.decision, admin_note: data.note ?? null, reviewed_by: context.userId, reviewed_at: new Date().toISOString() })
      .eq("id", data.id)
      .eq("status", "pending")
      .select("user_id, doc_type")
      .maybeSingle();
    if (error || !row) throw new Error("This document was already reviewed.");
    try {
      await admin.from("myr_notifications").insert({
        user_id: row.user_id,
        kind: "tenant_doc_reviewed",
        title: data.decision === "verified" ? "You're a verified tenant ✔" : "Document needs another look",
        body: data.decision === "verified" ? "Your ID was verified. Owners will see the Verified tenant badge." : `Your document was not accepted: ${data.note}`,
        link: "/verify",
      });
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });
