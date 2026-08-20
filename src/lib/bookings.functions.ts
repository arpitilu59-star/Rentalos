import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ============================================================
// Publish / unpublish RentDesk property + rooms to MYR
// ============================================================

const PublishPropertySchema = z.object({
  property_id: z.string().uuid(),
  publish: z.boolean(),
  city: z.string().optional(),
  address: z.string().optional(),
  description: z.string().max(2000).optional(),
  property_type: z.enum(["pg", "room", "flat", "hostel", "shared"]).optional(),
});

export const publishProperty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PublishPropertySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: p } = await supabase
      .from("properties")
      .select("id, owner_id")
      .eq("id", data.property_id)
      .maybeSingle();
    if (!p || p.owner_id !== userId) throw new Error("Forbidden");

    // #8 — a landlord must have an admin-verified KYC record before they
    // can publish a property to the public MYR marketplace. This is what
    // makes the "Verified owner" trust claim actually mean something.
    if (data.publish) {
      const { data: kyc } = await supabase
        .from("myr_verifications")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "landlord")
        .eq("status", "verified")
        .maybeSingle();
      if (!kyc) throw new Error("KYC_REQUIRED");
    }

    const patch = {
      is_public_listing: data.publish,
      ...(data.publish
        ? { verification_status: "verified", verified_at: new Date().toISOString() }
        : {}),
      ...(data.city !== undefined ? { myr_city: data.city } : {}),
      ...(data.address !== undefined ? { myr_address: data.address } : {}),
      ...(data.description !== undefined ? { myr_description: data.description } : {}),
      ...(data.property_type !== undefined ? { property_type: data.property_type } : {}),
    };

    const { error } = await supabase
      .from("properties")
      .update(patch as never)
      .eq("id", data.property_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const PublishRoomSchema = z.object({
  room_id: z.string().uuid(),
  publish: z.boolean(),
  amenities: z.array(z.string()).optional(),
  description: z.string().max(1000).optional(),
  deposit: z.number().nonnegative().optional(),
  available: z.boolean().optional(),
});

export const publishRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PublishRoomSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await supabase
      .from("rooms")
      .select("id, owner_id, property_id")
      .eq("id", data.room_id)
      .maybeSingle();
    if (!r || r.owner_id !== userId) throw new Error("Forbidden");

    if (data.publish) {
      const { data: kyc } = await supabase
        .from("myr_verifications")
        .select("id")
        .eq("user_id", userId)
        .eq("kind", "landlord")
        .eq("status", "verified")
        .maybeSingle();
      if (!kyc) throw new Error("KYC_REQUIRED");
    }

    const patch = {
      is_public: data.publish,
      ...(data.amenities ? { myr_amenities: data.amenities } : {}),
      ...(data.description !== undefined ? { myr_description: data.description } : {}),
      ...(data.deposit !== undefined ? { myr_deposit: data.deposit } : {}),
      ...(data.available !== undefined ? { myr_available: data.available } : {}),
    };

    const { error } = await supabase
      .from("rooms")
      .update(patch as never)
      .eq("id", data.room_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// Tenant creates a booking request from MYR
// ============================================================

const CreateBookingSchema = z.object({
  room_id: z.string().uuid(),
  tenant_name: z.string().min(2).max(120),
  tenant_mobile: z.string().min(6).max(20),
  tenant_email: z.string().email().optional().nullable(),
  message: z.string().max(1000).optional(),
});

export const createBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateBookingSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: r } = await supabase
      .from("rooms")
      .select("id, property_id, owner_id, is_public, myr_available")
      .eq("id", data.room_id)
      .maybeSingle();
    if (!r || !r.is_public || !r.myr_available) throw new Error("Room not available");

    // Store mobile on tenant profile for future landlord auto-link
    await supabase
      .from("profiles")
      .update({ mobile: data.tenant_mobile, primary_role: "tenant" })
      .eq("id", userId);

    const { data: ins, error } = await supabase
      .from("bookings")
      .insert({
        room_id: r.id,
        property_id: r.property_id,
        landlord_id: r.owner_id,
        tenant_user_id: userId,
        tenant_name: data.tenant_name,
        tenant_mobile: data.tenant_mobile,
        tenant_email: data.tenant_email ?? null,
        message: data.message ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { booking_id: ins.id };
  });

// Tenant lists own bookings
export const listMyBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, status, created_at, tenant_id, room_id, property_id, tenant_name, tenant_mobile, rooms(room_number, rent_amount, properties(name, myr_city, myr_address))",
      )
      .eq("tenant_user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { bookings: data ?? [] };
  });

// Landlord lists incoming bookings
export const listLandlordBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, status, created_at, room_id, property_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, message, tenant_id, rooms(room_number, rent_amount), properties(name)",
      )
      .eq("landlord_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { bookings: data ?? [] };
  });

const DecideSchema = z.object({
  booking_id: z.string().uuid(),
  decision: z.enum(["accept", "reject"]),
  rent_share: z.number().nonnegative().optional(),
  move_in_date: z.string().optional(), // ISO date
});

// Landlord accepts / rejects → on accept, create tenant row + link mobile + tenant_code
export const decideBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => DecideSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b } = await supabase
      .from("bookings")
      .select(
        "id, landlord_id, room_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, status",
      )
      .eq("id", data.booking_id)
      .maybeSingle();
    if (!b || b.landlord_id !== userId) throw new Error("Forbidden");
    if (b.status !== "pending") throw new Error("Already decided");

    if (data.decision === "reject") {
      await supabase
        .from("bookings")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .eq("id", b.id);
      return { ok: true };
    }

    // Accept path
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: codeRow } = await supabaseAdmin.rpc("generate_tenant_code");
    const tenantCode = (codeRow as string) ?? null;

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("rent_amount")
      .eq("id", b.room_id)
      .single();

    const { data: newTenant, error: tErr } = await supabaseAdmin
      .from("tenants")
      .insert({
        owner_id: b.landlord_id,
        room_id: b.room_id,
        name: b.tenant_name,
        phone: b.tenant_mobile,
        email: b.tenant_email,
        persons: 1,
        move_in_date: data.move_in_date ?? new Date().toISOString().slice(0, 10),
        rent_share: data.rent_share ?? room?.rent_amount ?? null,
        active: true,
        tenant_user_id: b.tenant_user_id,
        tenant_code: tenantCode,
      })
      .select("id")
      .single();
    if (tErr) throw new Error(tErr.message);

    await supabaseAdmin
      .from("bookings")
      .update({
        status: "accepted",
        decided_at: new Date().toISOString(),
        tenant_id: newTenant.id,
      })
      .eq("id", b.id);

    // Mark room unavailable on MYR
    await supabaseAdmin.from("rooms").update({ myr_available: false }).eq("id", b.room_id);

    return { ok: true, tenant_id: newTenant.id, tenant_code: tenantCode };
  });
