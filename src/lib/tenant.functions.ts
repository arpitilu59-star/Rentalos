import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Resolve the tenant rows linked to the current authed user by user_id, mobile, or email. */
export const getMyTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
    const email = u?.user?.email?.toLowerCase() ?? null;
    const { data: prof } = await supabase.from("profiles").select("mobile").eq("id", userId).maybeSingle();
    const mobile = prof?.mobile ?? null;

    // Match by tenant_user_id (auto-linked), or mobile, or email
    const filters: string[] = [`tenant_user_id.eq.${userId}`];
    if (mobile) filters.push(`phone.eq.${mobile}`);
    if (email) filters.push(`email.ilike.${email}`);

    const { data, error } = await supabaseAdmin
      .from("tenants")
      .select("*, rooms(*, properties(*))")
      .or(filters.join(","))
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Also fetch pending bookings not yet accepted
    const { data: pendingBookings } = await supabaseAdmin
      .from("bookings")
      .select("id, status, created_at, tenant_id, rooms(room_number, rent_amount, properties(name, myr_city, myr_address, city, address))")
      .eq("tenant_user_id", userId)
      .in("status", ["pending", "rejected"])
      .order("created_at", { ascending: false });

    return { tenants: data ?? [], email, mobile, pendingBookings: pendingBookings ?? [] };
  });

const TidSchema = z.object({ tenant_id: z.string().uuid() });

async function assertTenantAccess(supabaseAdmin: any, userId: string, tenantId: string) {
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const email = u?.user?.email?.toLowerCase() ?? null;
  const { data: prof } = await supabaseAdmin.from("profiles").select("mobile").eq("id", userId).maybeSingle();
  const mobile = prof?.mobile ?? null;

  const { data } = await supabaseAdmin
    .from("tenants")
    .select("id, email, phone, room_id, owner_id, name, persons, rent_share, move_in_date, active, tenant_user_id")
    .eq("id", tenantId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
  const ok =
    data.tenant_user_id === userId ||
    (email && data.email && data.email.toLowerCase() === email) ||
    (mobile && data.phone && data.phone === mobile);
  if (!ok) throw new Error("Forbidden");
  return data;
}

export const getTenantDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TidSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = await assertTenantAccess(supabaseAdmin, userId, data.tenant_id);

    const [{ data: bills }, { data: deposit }, { data: room }, { data: tickets }, { data: meters }] = await Promise.all([
      supabaseAdmin.from("bills").select("*").eq("tenant_id", t.id).order("rent_period_start", { ascending: false }),
      supabaseAdmin.from("deposits").select("*").eq("tenant_id", t.id).maybeSingle(),
      supabaseAdmin.from("rooms").select("*, properties(*)").eq("id", t.room_id).maybeSingle(),
      supabaseAdmin.from("maintenance_tickets").select("*").eq("tenant_id", t.id).order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("meter_readings").select("*").eq("room_id", t.room_id).order("reading_date", { ascending: false }).limit(12),
    ]);

    const { data: landlord } = t.owner_id
      ? await supabaseAdmin.from("profiles").select("*").eq("id", t.owner_id).maybeSingle()
      : { data: null };

    const outstanding = (bills ?? []).reduce((s, b: any) => s + Math.max(0, (b.total_amount ?? 0) - (b.amount_paid ?? 0)), 0);
    const nextDue = (bills ?? []).find((b: any) => b.status !== "paid");

    return { tenant: t, bills: bills ?? [], deposit, room, tickets: tickets ?? [], meters: meters ?? [], outstanding, nextDue, landlord };
  });

const TicketSchema = z.object({
  tenant_id: z.string().uuid(),
  title: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
});

export const createTenantTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => TicketSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const t = await assertTenantAccess(supabaseAdmin, userId, data.tenant_id);
    const { error } = await supabaseAdmin.from("maintenance_tickets").insert({
      owner_id: t.owner_id,
      tenant_id: t.id,
      room_id: t.room_id,
      title: data.title,
      description: data.description ?? null,
      priority: data.priority,
      status: "open",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const signTenantBillPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenant_id: string; path: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTenantAccess(supabaseAdmin, userId, data.tenant_id);
    const { data: s, error } = await supabaseAdmin.storage.from("bill-pdfs").createSignedUrl(data.path, 600);
    if (error) throw new Error(error.message);
    return { url: s.signedUrl };
  });
