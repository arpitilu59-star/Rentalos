/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";
import { cleanDbError } from "@/lib/subscription.functions";
import { TermsSchema, completeness, type Terms } from "@/lib/terms/schema";

/** Public: current terms of a property (what a tenant would accept right now). */
export const getPublicTerms = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const admin = await getAdmin();
    const { data: p } = await admin
      .from("properties")
      .select("id, is_public_listing, terms_summary, current_terms_version")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!p || !p.is_public_listing)
      return { terms: null as Terms | null, version: null as number | null, completeness: 0 };
    if (!p.terms_summary) return { terms: null, version: null, completeness: 0 };
    const terms = TermsSchema.parse(p.terms_summary);
    return { terms, version: p.current_terms_version as number, completeness: completeness(terms) };
  });

/** Landlord editor: own property's current terms (never someone else's). */
export const getMyPropertyTerms = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ propertyId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: p } = await admin
      .from("properties")
      .select("id, name, owner_id, terms_summary, current_terms_version")
      .eq("id", data.propertyId)
      .maybeSingle();
    if (!p || p.owner_id !== context.userId) throw new Error("Property not found.");
    const { data: versions } = await admin
      .from("rental_terms_versions")
      .select("version, completeness, change_note, created_at")
      .eq("property_id", data.propertyId)
      .order("version", { ascending: false })
      .limit(20);
    return {
      name: p.name as string,
      terms: TermsSchema.parse(p.terms_summary ?? {}),
      version: (p.current_terms_version as number | null) ?? null,
      versions: versions ?? [],
    };
  });

/** Publishes a NEW immutable version. Existing booking snapshots are never touched. */
export const publishRentalTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        propertyId: z.string().uuid(),
        terms: TermsSchema,
        note: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: res, error } = await admin.rpc("publish_rental_terms", {
      _owner: context.userId,
      _property: data.propertyId,
      _terms: data.terms,
      _completeness: completeness(data.terms),
      _note: data.note ?? null,
    });
    if (error) throw new Error(cleanDbError(error.message));
    // Tell tenants with a pending request on this property that terms changed (best effort).
    try {
      const { data: pending } = await admin
        .from("bookings")
        .select("tenant_user_id")
        .eq("property_id", data.propertyId)
        .eq("status", "pending");
      for (const b of (pending ?? []) as { tenant_user_id: string }[]) {
        await admin.rpc("notify_user", {
          u: b.tenant_user_id,
          k: "booking_terms_changed",
          t: "Rental terms were updated",
          b: "The landlord updated the terms for a room you requested. What you accepted earlier is unchanged.",
          l: "/myr/bookings",
        });
      }
    } catch {
      /* notifications are best-effort */
    }
    return res as { id: string; version: number };
  });

/** Landlord: terms each tenant accepted for their booking requests. */
export const listMyTermsAcceptances = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data, error } = await admin
      .from("booking_terms_acceptances")
      .select("booking_id, terms_version, snapshot_hash, listened, accepted_at, snapshot")
      .eq("landlord_id", context.userId)
      .order("accepted_at", { ascending: false })
      .limit(200);
    if (error) throw new Error("Couldn't load accepted terms.");
    return data ?? [];
  });

/** Any active admin: visibility into adoption and gaps. */
export const adminTermsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: me } = await admin
      .from("admin_users")
      .select("role")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (!me) throw new Error("Admin access required.");
    const head = { count: "exact", head: true } as const;
    const [pub, withTerms, accepted, listened, recent] = await Promise.all([
      admin.from("properties").select("id", head).eq("is_public_listing", true),
      admin
        .from("properties")
        .select("id", head)
        .eq("is_public_listing", true)
        .not("current_terms_version", "is", null),
      admin.from("booking_terms_acceptances").select("id", head),
      admin.from("booking_terms_acceptances").select("id", head).eq("listened", true),
      admin
        .from("booking_terms_acceptances")
        .select("id, booking_id, property_id, terms_version, snapshot_hash, listened, accepted_at")
        .order("accepted_at", { ascending: false })
        .limit(30),
    ]);
    return {
      publicProperties: pub.count ?? 0,
      withTerms: withTerms.count ?? 0,
      acceptances: accepted.count ?? 0,
      listenedCount: listened.count ?? 0,
      recent: recent.data ?? [],
    };
  });

/** Tenant: own room requests with their accepted terms version and whether a newer version needs re-accepting. */
export const listMyRoomRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: rows, error } = await admin
      .from("bookings")
      .select("id, status, created_at, property_id, rooms(room_number, rent_amount), properties(name, city, current_terms_version, terms_summary)")
      .eq("tenant_user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error("Couldn't load your requests.");
    const out = [];
    for (const b of (rows ?? []) as any[]) {
      const { data: st } = await admin.rpc("terms_reaccept_status", { _booking: b.id });
      const s = (st ?? {}) as { needs?: boolean; accepted_version?: number | null; current_version?: number | null };
      const needs = !!s.needs && ["pending", "accepted"].includes(b.status);
      let terms: Terms | null = null;
      if (needs && b.properties?.terms_summary) {
        const parsed = TermsSchema.safeParse(b.properties.terms_summary);
        if (parsed.success) terms = parsed.data;
      }
      out.push({
        id: b.id as string,
        status: b.status as string,
        created_at: b.created_at as string,
        room: b.rooms?.room_number as string | undefined,
        rent: Number(b.rooms?.rent_amount ?? 0),
        property: b.properties?.name as string | undefined,
        city: b.properties?.city as string | undefined,
        acceptedVersion: s.accepted_version ?? null,
        currentVersion: s.current_version ?? null,
        needsReaccept: needs,
        terms,
      });
    }
    return out;
  });

export const reacceptTerms = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ bookingId: z.string().uuid(), acknowledgements: z.record(z.string(), z.boolean()), listened: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { error } = await admin.rpc("record_terms_reacceptance", {
      _user: context.userId,
      _booking: data.bookingId,
      _acks: data.acknowledgements,
      _listened: data.listened ?? false,
    });
    if (error) throw new Error(cleanDbError(error.message));
    return { ok: true };
  });

/** Landlord: per-booking terms status (accepted version, and whether the tenant still has to accept a newer one). */
export const landlordBookingTermsStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const { data: rows } = await admin
      .from("bookings").select("id").eq("landlord_id", context.userId).order("created_at", { ascending: false }).limit(100);
    const out: Record<string, { accepted: number | null; current: number | null; needs: boolean }> = {};
    await Promise.all(
      (rows ?? []).map(async (b: { id: string }) => {
        const { data } = await admin.rpc("terms_reaccept_status", { _booking: b.id });
        const s = (data ?? {}) as { accepted_version?: number | null; current_version?: number | null; needs?: boolean };
        out[b.id] = { accepted: s.accepted_version ?? null, current: s.current_version ?? null, needs: !!s.needs };
      }),
    );
    return out;
  });
