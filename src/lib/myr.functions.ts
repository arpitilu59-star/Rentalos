import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleSchema = z.object({ role: z.enum(["tenant", "landlord"]) });

export const ensureMyrRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("myr_user_roles")
      .upsert({ user_id: userId, role: data.role }, { onConflict: "user_id,role" });
    if (error) throw new Error(error.message);

    // Ensure a myr_user_profiles row exists
    const { data: existing } = await supabase
      .from("myr_user_profiles")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!existing) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", userId)
        .maybeSingle();
      await supabase
        .from("myr_user_profiles")
        .insert({ user_id: userId, display_name: prof?.full_name ?? null });
    }

    // For landlords, ensure a free subscription
    if (data.role === "landlord") {
      const { data: sub } = await supabase
        .from("myr_subscriptions")
        .select("id")
        .eq("landlord_id", userId)
        .maybeSingle();
      if (!sub) {
        await supabase
          .from("myr_subscriptions")
          .insert({ landlord_id: userId, plan: "free" });
      }
    }
    return { ok: true };
  });

export const getMyMyrRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("myr_user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { roles: (data ?? []).map((r) => r.role as "tenant" | "landlord" | "super_admin") };
  });

const ReserveSchema = z.object({ room_id: z.string().uuid(), minutes: z.number().int().min(1).max(60).optional() });

export const reserveRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ReserveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: bookingId, error } = await supabase.rpc("myr_reserve_room", {
      _room_id: data.room_id,
      _minutes: data.minutes ?? 10,
    });
    if (error) throw new Error(error.message);
    return { booking_id: bookingId as string };
  });

const CancelSchema = z.object({ booking_id: z.string().uuid() });

export const cancelMyrBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CancelSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: b } = await supabase
      .from("myr_bookings")
      .select("room_id, tenant_id, landlord_id, status")
      .eq("id", data.booking_id)
      .single();
    if (!b) throw new Error("Booking not found");
    if (b.tenant_id !== userId && b.landlord_id !== userId) throw new Error("Forbidden");
    if (b.status !== "reserved" && b.status !== "confirmed") throw new Error("Cannot cancel");

    await supabase
      .from("myr_bookings")
      .update({ status: "cancelled" })
      .eq("id", data.booking_id);
    await supabase
      .from("myr_listing_rooms")
      .update({ status: "available", reserved_until: null, reserved_by: null })
      .eq("id", b.room_id);
    return { ok: true };
  });



const PublishSchema = z.object({
  property_id: z.string().uuid(),
  type: z.enum(["pg", "room", "flat", "hostel", "shared"]).default("pg"),
  description: z.string().max(2000).optional(),
});

export const publishPropertyToMyr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PublishSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // 1. Verify ownership of RentDesk property
    const { data: prop, error: pErr } = await supabase
      .from("properties")
      .select("id,name,city,address,latitude,longitude,notes,owner_id")
      .eq("id", data.property_id)
      .maybeSingle();
    if (pErr) throw new Error(pErr.message);
    if (!prop) throw new Error("Property not found");
    if (prop.owner_id !== userId) throw new Error("Forbidden");

    // 2. Ensure landlord role + subscription
    await supabase
      .from("myr_user_roles")
      .upsert({ user_id: userId, role: "landlord" }, { onConflict: "user_id,role" });
    const { data: existProf } = await supabase
      .from("myr_user_profiles").select("user_id").eq("user_id", userId).maybeSingle();
    if (!existProf) {
      const { data: rdProf } = await supabase
        .from("profiles").select("full_name").eq("id", userId).maybeSingle();
      await supabase.from("myr_user_profiles").insert({ user_id: userId, display_name: rdProf?.full_name ?? null });
    }
    const { data: sub } = await supabase
      .from("myr_subscriptions").select("id").eq("landlord_id", userId).maybeSingle();
    if (!sub) await supabase.from("myr_subscriptions").insert({ landlord_id: userId, plan: "free" });

    // 3. Check if a listing already exists for this property (idempotent via notes marker)
    const marker = `[rentdesk:${prop.id}]`;
    const { data: existing } = await supabase
      .from("myr_listings")
      .select("id")
      .eq("landlord_id", userId)
      .ilike("description", `%${marker}%`)
      .maybeSingle();

    let listingId = existing?.id as string | undefined;
    const desc = (data.description ?? prop.notes ?? "") + `\n\n${marker}`;

    if (!listingId) {
      const { data: ins, error: lErr } = await supabase
        .from("myr_listings")
        .insert({
          landlord_id: userId,
          title: prop.name,
          type: data.type,
          city: prop.city,
          address_line: prop.address,
          latitude: prop.latitude,
          longitude: prop.longitude,
          description: desc,
          status: "draft",
        })
        .select("id")
        .single();
      if (lErr) throw new Error(lErr.message);
      listingId = ins.id;
    } else {
      await supabase
        .from("myr_listings")
        .update({
          title: prop.name,
          city: prop.city,
          address_line: prop.address,
          latitude: prop.latitude,
          longitude: prop.longitude,
        })
        .eq("id", listingId);
    }

    // 4. Sync rooms from rentdesk → myr_listing_rooms (insert new only, label by room_number)
    const { data: rdRooms } = await supabase
      .from("rooms")
      .select("id,room_number,rent_amount")
      .eq("property_id", prop.id);

    const { data: myrRooms } = await supabase
      .from("myr_listing_rooms")
      .select("label")
      .eq("listing_id", listingId);
    const existingLabels = new Set((myrRooms ?? []).map((r) => r.label));

    const toInsert = (rdRooms ?? [])
      .filter((r) => !existingLabels.has(r.room_number))
      .map((r) => ({
        listing_id: listingId!,
        label: r.room_number,
        rent: Number(r.rent_amount) || 0,
        deposit: Number(r.rent_amount) || 0,
        capacity: 1,
      }));
    if (toInsert.length > 0) {
      const { error: rErr } = await supabase.from("myr_listing_rooms").insert(toInsert);
      if (rErr) throw new Error(rErr.message);
    }

    return { listing_id: listingId, rooms_added: toInsert.length };
  });

