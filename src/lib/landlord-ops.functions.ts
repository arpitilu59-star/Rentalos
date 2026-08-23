import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ============ Verifications ============ */

const CreateVerificationInput = z.object({
  kind: z.enum(["tenant", "landlord", "property"]),
  tenant_id: z.string().uuid().nullable().optional(),
  landlord_user_id: z.string().uuid().nullable().optional(),
  property_id: z.string().uuid().nullable().optional(),
  notes: z.string().max(2000).optional(),
  documents: z
    .array(
      z.object({ doc_type: z.string().min(1).max(50), storage_path: z.string().min(1).max(500) }),
    )
    .max(10)
    .default([]),
});

export const createVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateVerificationInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: v, error } = await supabase
      .from("verifications")
      .insert({
        kind: data.kind,
        tenant_id: data.tenant_id ?? null,
        landlord_user_id: data.landlord_user_id ?? null,
        property_id: data.property_id ?? null,
        owner_id: userId,
        notes: data.notes ?? null,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    if (data.documents.length > 0) {
      const rows = data.documents.map((d) => ({
        verification_id: v.id,
        doc_type: d.doc_type,
        storage_path: d.storage_path,
        uploaded_by: userId,
      }));
      const { error: e2 } = await supabase.from("verification_documents").insert(rows);
      if (e2) throw new Error(e2.message);
    }
    return { id: v.id };
  });

export const listVerifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("verifications")
      .select("*, verification_documents(*), tenants(name, phone)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const ReviewInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["verified", "rejected"]),
  rejection_reason: z.string().max(500).optional(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden — admin only.");
}

export const reviewVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => ReviewInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // SECURITY FIX: this function previously had no admin check at all —
    // any authenticated user (including the landlord/tenant the
    // verification is about) could call it and mark their own row
    // "verified" with themselves as reviewer. Only admins may decide.
    await assertAdmin(supabase, userId);
    const { error } = await supabase
      .from("verifications")
      .update({
        status: data.status,
        rejection_reason: data.status === "rejected" ? (data.rejection_reason ?? null) : null,
        reviewed_by: userId,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Maintenance tickets ============ */

const CreateTicketInput = z.object({
  property_id: z.string().uuid().nullable().optional(),
  room_id: z.string().uuid().nullable().optional(),
  tenant_id: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  photo_paths: z.array(z.string().max(500)).max(10).default([]),
});

export const createTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateTicketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: t, error } = await supabase
      .from("maintenance_tickets")
      .insert({
        owner_id: userId,
        property_id: data.property_id ?? null,
        room_id: data.room_id ?? null,
        tenant_id: data.tenant_id ?? null,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        photo_paths: data.photo_paths,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { id: t.id };
  });

export const listTickets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("maintenance_tickets")
      .select("*, rooms(room_number), tenants(name), properties(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

const UpdateTicketInput = z.object({
  id: z.string().uuid(),
  status: z.enum(["open", "in_progress", "resolved", "closed"]),
  resolution_notes: z.string().max(2000).optional(),
});

export const updateTicketStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => UpdateTicketInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const patch: { status: typeof data.status; resolution_notes?: string; resolved_at?: string } = {
      status: data.status,
    };
    if (data.resolution_notes) patch.resolution_notes = data.resolution_notes;
    if (data.status === "resolved" || data.status === "closed")
      patch.resolved_at = new Date().toISOString();
    const { error } = await supabase.from("maintenance_tickets").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ============ Move-in / Move-out ============ */

const MoveInput = z.object({
  tenant_id: z.string().uuid(),
  room_id: z.string().uuid(),
  kind: z.enum(["move_in", "move_out"]),
  move_date: z.string().min(8).max(20),
  meter_reading: z.number().nullable().optional(),
  condition_notes: z.string().max(2000).optional(),
  photo_paths: z.array(z.string().max(500)).max(20).default([]),
  checklist: z.record(z.string(), z.boolean()).default({}) as z.ZodType<Record<string, boolean>>,
});

export const createMoveRecord = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => MoveInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("move_records").insert({
      owner_id: userId,
      tenant_id: data.tenant_id,
      room_id: data.room_id,
      kind: data.kind,
      move_date: data.move_date,
      meter_reading: data.meter_reading ?? null,
      condition_notes: data.condition_notes ?? null,
      photo_paths: data.photo_paths,
      checklist: data.checklist,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMoveRecords = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("move_records")
      .select("*, tenants(name, phone), rooms(room_number)")
      .order("move_date", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

/* ============ Deposits ============ */

const DepositInput = z.object({
  tenant_id: z.string().uuid(),
  amount_held: z.number().min(0),
});

export const createDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => DepositInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("deposits")
      .insert({ owner_id: userId, tenant_id: data.tenant_id, amount_held: data.amount_held });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const SettleInput = z.object({
  id: z.string().uuid(),
  amount_deducted: z.number().min(0),
  deduction_reason: z.string().max(1000).optional(),
});

export const settleDeposit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SettleInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: d0, error: eg } = await supabase
      .from("deposits")
      .select("amount_held")
      .eq("id", data.id)
      .single();
    if (eg) throw new Error(eg.message);
    const refund = Math.max(0, Number(d0.amount_held) - data.amount_deducted);
    const status =
      data.amount_deducted >= Number(d0.amount_held)
        ? "forfeited"
        : refund > 0 && data.amount_deducted > 0
          ? "partial_refunded"
          : "refunded";
    const { error } = await supabase
      .from("deposits")
      .update({
        amount_deducted: data.amount_deducted,
        amount_refunded: refund,
        deduction_reason: data.deduction_reason ?? null,
        status,
        refunded_at: new Date().toISOString(),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { refunded: refund };
  });

export const listDeposits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("deposits")
      .select("*, tenants(name, phone)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { items: data ?? [] };
  });

/* ============ Activity log (client-recorded) ============ */

const LogInput = z.object({
  action: z.string().min(1).max(100),
  target_type: z.string().max(50).optional(),
  target_id: z.string().max(100).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
});

export const logActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => LogInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase.from("activity_log").insert({
      user_id: userId,
      action: data.action,
      target_type: data.target_type ?? null,
      target_id: data.target_id ?? null,
      metadata: data.metadata as Record<string, never>,
    });
    return { ok: true };
  });
