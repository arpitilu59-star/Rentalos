import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { missingAcks } from "./terms/schema";
import { buildPropertyPublishPatch, buildRoomPublishPatch } from "./publish-patch";

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

    const patch = buildPropertyPublishPatch(data);

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

    const patch = buildRoomPublishPatch(data);

    const { error } = await supabase
      .from("rooms")
      .update(patch as never)
      .eq("id", data.room_id);
    if (error) {
      if (/ROOM_FULL/.test(error.message))
        throw new Error(
          "This room is full, so it can't be shown on Rentalos. It is published again automatically when a tenant moves out (mark the tenant inactive).",
        );
      throw new Error(error.message);
    }
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
  acknowledgements: z.record(z.string(), z.boolean()).optional(),
  listened: z.boolean().optional(),
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

    // Vacancy + abuse guards (service role: these read other users' rows).
    const { supabaseAdmin: guard } = await import("@/integrations/supabase/client.server");
    const [{ data: roomRow }, { count: active }, { data: mine }] = await Promise.all([
      guard.from("rooms").select("capacity").eq("id", r.id).maybeSingle(),
      guard.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", r.id).eq("active", true),
      guard.from("bookings").select("id, room_id, status").eq("tenant_user_id", userId).eq("status", "pending"),
    ]);
    if ((active ?? 0) >= ((roomRow as { capacity: number } | null)?.capacity ?? 1))
      throw new Error("Room not available");
    if ((mine ?? []).some((b: { room_id: string }) => b.room_id === r.id))
      throw new Error("You already have a pending request for this room.");
    if ((mine ?? []).length >= 10)
      throw new Error("You have too many pending requests. Wait for owners to respond first.");

    // Terms gate: if the landlord published terms, every acknowledgement is required BEFORE
    // anything is created. The snapshot itself is built in the database, never from the client.
    const { supabaseAdmin: adminForTerms } = await import("@/integrations/supabase/client.server");
    const { data: prop } = await adminForTerms
      .from("properties")
      .select("current_terms_version")
      .eq("id", r.property_id)
      .maybeSingle();
    const termsPublished =
      (prop as { current_terms_version: number | null } | null)?.current_terms_version != null;
    if (termsPublished) {
      const missing = missingAcks(data.acknowledgements);
      if (missing.length)
        throw new Error(
          "TERMS_REQUIRED: please read and tick every acknowledgement before sending the request.",
        );
    }

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

    const { error: accErr } = await (
      adminForTerms as unknown as {
        rpc: (n: string, a: object) => PromiseLike<{ error: { message: string } | null }>;
      }
    ).rpc("record_terms_acceptance", {
      _user: userId,
      _booking: ins.id,
      _acks: data.acknowledgements ?? {},
      _listened: data.listened ?? false,
    });
    if (accErr) {
      // No acceptance, no booking: undo so a request never exists without its terms record.
      await adminForTerms.from("bookings").delete().eq("id", ins.id);
      throw new Error(
        accErr.message.replace(/^.*?ERROR:\s*/, "").slice(0, 200) ||
          "Couldn't record the terms. Please try again.",
      );
    }
    // Admin visibility: every new booking is surfaced so a human can confirm it is genuine.
    try {
      const { data: admins } = await adminForTerms.from("admin_users").select("user_id").eq("active", true);
      if (admins?.length)
        await adminForTerms.from("myr_notifications").insert(
          admins.map((a: { user_id: string }) => ({
            user_id: a.user_id,
            kind: "admin_new_booking",
            title: "New booking request",
            body: `${data.tenant_name} (${data.tenant_mobile}) requested a room. Verify it in Admin → Bookings.`,
            link: "/admin/bookings",
          })),
        );
    } catch {
      /* best-effort: the Admin → Bookings page is the source of truth */
    }
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
    const [{ data: cap }, { count: occupied }] = await Promise.all([
      supabaseAdmin.from("rooms").select("capacity").eq("id", b.room_id).maybeSingle(),
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", b.room_id).eq("active", true),
    ]);
    if ((occupied ?? 0) >= ((cap as { capacity: number } | null)?.capacity ?? 1))
      throw new Error("This room is already full. Reject the request or free a slot first.");
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

    // The room's listing state (full => hidden, vacancy => shown) is maintained by the database
    // trigger on tenants. If this acceptance filled the room, the other waiting requests can't be
    // honoured: close them so those tenants aren't left hanging.
    const { count: nowOccupied } = await supabaseAdmin
      .from("tenants")
      .select("id", { count: "exact", head: true })
      .eq("room_id", b.room_id)
      .eq("active", true);
    if ((nowOccupied ?? 0) >= ((cap as { capacity: number } | null)?.capacity ?? 1)) {
      const { data: others } = await supabaseAdmin
        .from("bookings")
        .select("id, tenant_user_id")
        .eq("room_id", b.room_id)
        .eq("status", "pending")
        .neq("id", b.id);
      if (others?.length) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "rejected", decided_at: new Date().toISOString() })
          .in("id", others.map((o: { id: string }) => o.id));
        await supabaseAdmin.from("myr_notifications").insert(
          others.map((o: { tenant_user_id: string }) => ({
            user_id: o.tenant_user_id,
            kind: "booking_closed",
            title: "Room no longer available",
            body: "Another tenant booked this room. Browse similar rooms on Rentalos.",
            link: "/myr/browse",
          })),
        );
      }
    }

    return { ok: true, tenant_id: newTenant.id, tenant_code: tenantCode };
  });
