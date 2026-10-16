import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";

/** Admins who may see booking contact details (tenant mobile) and mark a booking as verified. */
export const ADMIN_BOOKING_ROLES = [
  "root_owner",
  "full_admin",
  "support_admin",
  "property_admin",
] as const;

async function requireBookingAdmin(userId: string) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("admin_users")
    .select("id, role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("Couldn't verify your admin access. Please try again.");
  if (!data) throw new Error("Admin access required.");
  if (!(ADMIN_BOOKING_ROLES as readonly string[]).includes(data.role))
    throw new Error("Your admin role isn't allowed to view bookings.");
  return { admin, adminRowId: data.id as string };
}

const FiltersSchema = z.object({
  status: z.enum(["all", "pending", "accepted", "rejected", "cancelled", "completed"]).default("all"),
  review: z.enum(["all", "unchecked", "confirmed", "suspicious"]).default("all"),
  q: z.string().trim().max(60).optional(),
});

type BookingRow = {
  id: string;
  status: string;
  created_at: string;
  decided_at: string | null;
  message: string | null;
  tenant_name: string;
  tenant_mobile: string;
  tenant_email: string | null;
  tenant_user_id: string;
  landlord_id: string;
  room_id: string;
  property_id: string;
  tenant_id: string | null;
  admin_review: string;
  admin_note: string | null;
  admin_reviewed_at: string | null;
};

/** Strip everything but digits so "+91 98765-43210" matches a search for "98765". */
export const digitsOnly = (v: string) => v.replace(/\D/g, "");

export const adminListBookings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => FiltersSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { admin } = await requireBookingAdmin(context.userId);
    let q = admin
      .from("bookings")
      .select(
        "id, status, created_at, decided_at, message, tenant_name, tenant_mobile, tenant_email, tenant_user_id, landlord_id, room_id, property_id, tenant_id, admin_review, admin_note, admin_reviewed_at",
      )
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.status !== "all") q = q.eq("status", data.status);
    if (data.review !== "all") q = q.eq("admin_review", data.review);
    const { data: rows, error } = await q;
    if (error) throw new Error("Couldn't load bookings. Please try again.");
    const list = (rows ?? []) as BookingRow[];

    const ids = (v: (b: BookingRow) => string | null) =>
      Array.from(new Set(list.map(v).filter((x): x is string => !!x)));
    const [rooms, props, landlords, accepts, tenants] = await Promise.all([
      admin.from("rooms").select("id, room_number, rent_amount").in("id", ids((b) => b.room_id)),
      admin.from("properties").select("id, name, city, myr_city").in("id", ids((b) => b.property_id)),
      admin.from("profiles").select("id, full_name, mobile, phone, email").in("id", ids((b) => b.landlord_id)),
      admin
        .from("booking_terms_acceptances")
        .select("booking_id, terms_version, accepted_at")
        .in("booking_id", ids((b) => b.id)),
      admin.from("tenants").select("id, active").in("id", ids((b) => b.tenant_id)),
    ]);
    const by = <T extends { id: string }>(r: { data: T[] | null }) =>
      new Map((r.data ?? []).map((x) => [x.id, x]));
    const roomM = by(rooms as { data: { id: string; room_number: string; rent_amount: number }[] | null });
    const propM = by(props as { data: { id: string; name: string; city: string | null; myr_city: string | null }[] | null });
    const landM = by(
      landlords as { data: { id: string; full_name: string | null; mobile: string | null; phone: string | null; email: string | null }[] | null },
    );
    const tenM = by(tenants as { data: { id: string; active: boolean }[] | null });
    const accM = new Map(
      ((accepts.data ?? []) as { booking_id: string; terms_version: number | null; accepted_at: string }[]).map((a) => [a.booking_id, a]),
    );

    // How many OTHER bookings share this mobile number: a cheap duplicate/abuse signal.
    const mobileCount = new Map<string, number>();
    for (const b of list) {
      const k = digitsOnly(b.tenant_mobile).slice(-10);
      mobileCount.set(k, (mobileCount.get(k) ?? 0) + 1);
    }

    let out = list.map((b) => {
      const r = roomM.get(b.room_id);
      const p = propM.get(b.property_id);
      const l = landM.get(b.landlord_id);
      const a = accM.get(b.id);
      return {
        id: b.id,
        status: b.status,
        createdAt: b.created_at,
        decidedAt: b.decided_at,
        message: b.message,
        tenant: { name: b.tenant_name, mobile: b.tenant_mobile, email: b.tenant_email },
        landlord: { name: l?.full_name ?? null, mobile: l?.mobile || l?.phone || null, email: l?.email ?? null },
        property: p ? `${p.name}${p.myr_city || p.city ? ` · ${p.myr_city || p.city}` : ""}` : "—",
        room: r ? `Room ${r.room_number}` : "—",
        rent: r ? Number(r.rent_amount) : null,
        termsVersion: a ? (a.terms_version ?? 0) : null,
        tenantActive: b.tenant_id ? (tenM.get(b.tenant_id)?.active ?? null) : null,
        sameMobileBookings: mobileCount.get(digitsOnly(b.tenant_mobile).slice(-10)) ?? 1,
        review: b.admin_review,
        note: b.admin_note,
        reviewedAt: b.admin_reviewed_at,
      };
    });

    const needle = data.q?.trim().toLowerCase();
    if (needle) {
      const nd = digitsOnly(needle);
      out = out.filter(
        (b) =>
          b.tenant.name.toLowerCase().includes(needle) ||
          (nd.length >= 3 && digitsOnly(b.tenant.mobile).includes(nd)) ||
          (nd.length >= 3 && digitsOnly(b.landlord.mobile ?? "").includes(nd)) ||
          (b.landlord.name ?? "").toLowerCase().includes(needle) ||
          b.property.toLowerCase().includes(needle),
      );
    }
    return { bookings: out };
  });

export const adminReviewBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        bookingId: z.string().uuid(),
        review: z.enum(["unchecked", "confirmed", "suspicious"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, adminRowId } = await requireBookingAdmin(context.userId);
    if (data.review === "suspicious" && !data.note)
      throw new Error("Add a short note explaining why this booking looks suspicious.");
    const { error } = await admin
      .from("bookings")
      .update({
        admin_review: data.review,
        admin_note: data.note ?? null,
        admin_reviewed_by: context.userId,
        admin_reviewed_at: data.review === "unchecked" ? null : new Date().toISOString(),
      })
      .eq("id", data.bookingId);
    if (error) throw new Error("Couldn't save the review. Please try again.");
    await admin.from("admin_audit_logs").insert({
      admin_user_id: adminRowId,
      action: `booking_review_${data.review}`,
      target_type: "booking",
      target_id: data.bookingId,
      metadata: { note: data.note ?? null },
    });
    return { ok: true };
  });
