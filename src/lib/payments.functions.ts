import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// -------- Tenant: get bill + landlord UPI details for pay screen --------
const GetPayBillSchema = z.object({ bill_id: z.string().uuid() });

export const getTenantPayBill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => GetPayBillSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select("id, total_amount, amount_paid, status, rent_period_start, owner_id, tenant_id, room_id, rooms(room_number)")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");

    // access check via tenant_user_id
    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("id, tenant_user_id")
      .eq("id", bill.tenant_id ?? "")
      .maybeSingle();
    if (!t || t.tenant_user_id !== userId) throw new Error("Forbidden");

    const { data: landlord } = await supabaseAdmin
      .from("profiles")
      .select("full_name, business_name, upi_id, mobile")
      .eq("id", bill.owner_id)
      .maybeSingle();

    const { data: payments } = await supabaseAdmin
      .from("payments")
      .select("id, amount, upi_ref, screenshot_path, verification_status, verified_at, created_at, note")
      .eq("bill_id", bill.id)
      .order("created_at", { ascending: false });

    return { bill, landlord, payments: payments ?? [] };
  });

// -------- Tenant: submit payment proof --------
const SubmitProofSchema = z.object({
  bill_id: z.string().uuid(),
  amount: z.number().positive(),
  upi_ref: z.string().max(64).optional(),
  note: z.string().max(500).optional(),
  screenshot_base64: z.string().optional(),
  screenshot_mime: z.string().optional(),
});

export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SubmitProofSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select("id, owner_id, tenant_id")
      .eq("id", data.bill_id)
      .maybeSingle();
    if (!bill) throw new Error("Bill not found");

    const { data: t } = await supabaseAdmin
      .from("tenants")
      .select("id, tenant_user_id")
      .eq("id", bill.tenant_id ?? "")
      .maybeSingle();
    if (!t || t.tenant_user_id !== userId) throw new Error("Forbidden");

    let screenshot_path: string | null = null;
    if (data.screenshot_base64) {
      const bin = Uint8Array.from(atob(data.screenshot_base64), (c) => c.charCodeAt(0));
      const ext = (data.screenshot_mime || "image/jpeg").split("/")[1] || "jpg";
      const path = `${userId}/${bill.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabaseAdmin.storage
        .from("payment-proofs")
        .upload(path, bin, { contentType: data.screenshot_mime || "image/jpeg", upsert: false });
      if (upErr) throw new Error(upErr.message);
      screenshot_path = path;
    }

    const { data: ins, error } = await supabaseAdmin
      .from("payments")
      .insert({
        owner_id: bill.owner_id,
        bill_id: bill.id,
        tenant_user_id: userId,
        amount: data.amount,
        method: "upi",
        upi_ref: data.upi_ref ?? null,
        note: data.note ?? null,
        screenshot_path,
        verification_status: "submitted",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { payment_id: ins.id };
  });

// -------- Tenant/Landlord: signed URL for a payment screenshot --------
const SignSchema = z.object({ path: z.string() });
export const signPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => SignSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // access via payment row
    const { data: p } = await supabaseAdmin
      .from("payments")
      .select("owner_id, tenant_user_id")
      .eq("screenshot_path", data.path)
      .maybeSingle();
    if (!p || (p.owner_id !== userId && p.tenant_user_id !== userId)) throw new Error("Forbidden");
    const { data: s, error } = await supabaseAdmin.storage.from("payment-proofs").createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: s.signedUrl };
  });

// -------- Landlord: list pending payment proofs --------
export const listPendingPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Fetch payments WITHOUT PostgREST embed (no FK on payments.bill_id → bills.id,
    // so embeds silently break or filter rows). Do manual joins in JS.
    const { data: rawPayments, error } = await supabaseAdmin
      .from("payments")
      .select("id, amount, upi_ref, screenshot_path, verification_status, created_at, note, bill_id, tenant_user_id")
      .eq("owner_id", userId)
      .in("verification_status", ["submitted", "pending"])
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const payments = rawPayments ?? [];
    const billIds = Array.from(new Set(payments.map((p: any) => p.bill_id).filter(Boolean)));
    const tenantUserIds = Array.from(new Set(payments.map((p: any) => p.tenant_user_id).filter(Boolean)));

    const [{ data: bills }, { data: tenantsByUser }] = await Promise.all([
      billIds.length
        ? supabaseAdmin.from("bills").select("id, total_amount, amount_paid, rent_period_start, room_id, tenant_id").in("id", billIds)
        : Promise.resolve({ data: [] as any[] }),
      tenantUserIds.length
        ? supabaseAdmin.from("tenants").select("id, name, phone, tenant_code, tenant_user_id, room_id").in("tenant_user_id", tenantUserIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const billMap = new Map((bills ?? []).map((b: any) => [b.id, b]));
    const tenantByUserMap = new Map((tenantsByUser ?? []).map((t: any) => [t.tenant_user_id, t]));

    // Collect tenant/room ids from bills + tenant fallback
    const tenantIds = new Set<string>();
    const roomIds = new Set<string>();
    for (const p of payments) {
      const b = billMap.get(p.bill_id) as any;
      if (b?.tenant_id) tenantIds.add(b.tenant_id);
      if (b?.room_id) roomIds.add(b.room_id);
      const tu = tenantByUserMap.get(p.tenant_user_id) as any;
      if (tu?.id) tenantIds.add(tu.id);
      if (tu?.room_id) roomIds.add(tu.room_id);
    }

    const [{ data: tenants }, { data: rooms }] = await Promise.all([
      tenantIds.size
        ? supabaseAdmin.from("tenants").select("id, name, phone, tenant_code").in("id", Array.from(tenantIds))
        : Promise.resolve({ data: [] as any[] }),
      roomIds.size
        ? supabaseAdmin.from("rooms").select("id, room_number, property_id").in("id", Array.from(roomIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const tenantMap = new Map((tenants ?? []).map((t: any) => [t.id, t]));
    const roomMap = new Map((rooms ?? []).map((r: any) => [r.id, r]));

    const propIds = Array.from(new Set((rooms ?? []).map((r: any) => r.property_id).filter(Boolean)));
    const { data: props } = propIds.length
      ? await supabaseAdmin.from("properties").select("id, name").in("id", propIds)
      : { data: [] as any[] };
    const propMap = new Map((props ?? []).map((pr: any) => [pr.id, pr]));

    const enriched = payments.map((p: any) => {
      const b = billMap.get(p.bill_id) as any;
      const tuFallback = tenantByUserMap.get(p.tenant_user_id) as any;
      const tenant = (b?.tenant_id && tenantMap.get(b.tenant_id)) || tuFallback || null;
      const room = (b?.room_id && roomMap.get(b.room_id)) || (tuFallback?.room_id && roomMap.get(tuFallback.room_id)) || null;
      const property = room?.property_id ? propMap.get(room.property_id) : null;
      return {
        ...p,
        bills: b
          ? {
              id: b.id,
              total_amount: b.total_amount,
              amount_paid: b.amount_paid,
              rent_period_start: b.rent_period_start,
              room_id: b.room_id,
              tenant_id: b.tenant_id,
              rooms: room ? { id: room.id, room_number: room.room_number, properties: property ? { name: property.name } : null } : null,
              tenants: tenant ? { id: tenant.id, name: tenant.name, phone: tenant.phone, tenant_code: tenant.tenant_code } : null,
            }
          : {
              // Orphan bill — still surface the payment so landlord can review/reject
              id: null,
              total_amount: null,
              amount_paid: null,
              rent_period_start: null,
              room_id: room?.id ?? null,
              tenant_id: tenant?.id ?? null,
              rooms: room ? { id: room.id, room_number: room.room_number, properties: property ? { name: property.name } : null } : null,
              tenants: tenant ? { id: tenant.id, name: tenant.name, phone: tenant.phone, tenant_code: tenant.tenant_code } : null,
              _orphan: true,
            },
      };
    });

    return { payments: enriched };
  });

// -------- Landlord: verify or reject payment proof --------
const VerifySchema = z.object({
  payment_id: z.string().uuid(),
  decision: z.enum(["verify", "reject"]),
});

export const verifyPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => VerifySchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: p } = await supabaseAdmin
      .from("payments")
      .select("id, owner_id, bill_id, amount, verification_status")
      .eq("id", data.payment_id)
      .maybeSingle();
    if (!p || p.owner_id !== userId) throw new Error("Forbidden");
    if (p.verification_status === "verified") throw new Error("Already verified");

    if (data.decision === "reject") {
      await supabaseAdmin
        .from("payments")
        .update({ verification_status: "rejected", verified_at: new Date().toISOString(), verified_by: userId })
        .eq("id", p.id);
      return { ok: true };
    }

    // Verify: apply amount to bill
    const { data: bill } = await supabaseAdmin
      .from("bills")
      .select("id, total_amount, amount_paid")
      .eq("id", p.bill_id)
      .single();
    if (!bill) throw new Error("Bill missing");
    const newPaid = Number(bill.amount_paid ?? 0) + Number(p.amount);
    const status = newPaid >= Number(bill.total_amount) ? "paid" : "partial";
    await supabaseAdmin.from("bills").update({
      amount_paid: newPaid,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    }).eq("id", bill.id);

    await supabaseAdmin.from("payments").update({
      verification_status: "verified",
      verified_at: new Date().toISOString(),
      verified_by: userId,
    }).eq("id", p.id);

    return { ok: true, new_status: status };
  });
