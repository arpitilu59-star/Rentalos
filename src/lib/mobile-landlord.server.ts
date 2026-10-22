/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
/**
 * Landlord features of the RentDesk app (/api/app/l/*). Same ownership + subscription rules as the web
 * server functions; the app additionally forces a COMPLETE listing (property, room, photos, terms)
 * before a room can be published.
 */
import { TermsSchema, completeness, NS, type Terms } from "./terms/schema";
import { z } from "zod";
import { anniversaryRange } from "./db";

const str = (v: unknown, max: number): string =>
  typeof v === "string" ? v.trim().slice(0, max) : "";
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v)
    ? v
    : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))
      ? Number(v)
      : null;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string => {
  const s = str(v, 40);
  if (!UUID.test(s)) throw new Error("Invalid id.");
  return s;
};
const iso = (v: unknown): string | null => {
  const s = str(v, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
};
const cleanDb = (m: string) => m.replace(/^.*?ERROR:\s*/, "").slice(0, 200);
const d2 = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

async function admin() {
  const { getAdmin } = await import("./whatsapp/db");
  return (await getAdmin()) as any;
}
async function entitled(
  me: string,
  f: "payment_verification" | "live_feed_video" | "partner_import",
): Promise<boolean> {
  const { hasEntitlement } = await import("./subscription/entitlements");
  return hasEntitlement(me, f);
}
async function need(me: string, f: "payment_verification" | "live_feed_video" | "partner_import") {
  const { requireEntitlement } = await import("./subscription/entitlements");
  await requireEntitlement(me, f);
}

// ---------------------------------------------------------------- gate

/** A landlord account = has the landlord role or already owns a property. Tenants are kept out. */
export async function isLandlord(a: any, me: string): Promise<boolean> {
  const [{ data: role }, { count }] = await Promise.all([
    a
      .from("myr_user_roles")
      .select("user_id")
      .eq("user_id", me)
      .eq("role", "landlord")
      .maybeSingle(),
    a.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", me),
  ]);
  return !!role || (count ?? 0) > 0;
}

/** Called right after RentDesk sign-up: marks the new account as a landlord (same as web landlord signup). */
export async function claimLandlord(me: string) {
  const a = await admin();
  // A person who already rents a room as a tenant keeps that; landlord role is simply added.
  await a
    .from("myr_user_roles")
    .upsert({ user_id: me, role: "landlord" }, { onConflict: "user_id,role" });
  const { data: existing } = await a
    .from("myr_user_profiles")
    .select("user_id")
    .eq("user_id", me)
    .maybeSingle();
  if (!existing) {
    const { data: prof } = await a.from("profiles").select("full_name").eq("id", me).maybeSingle();
    await a
      .from("myr_user_profiles")
      .insert({ user_id: me, display_name: prof?.full_name ?? null });
  }
  const { data: sub } = await a
    .from("myr_subscriptions")
    .select("id")
    .eq("landlord_id", me)
    .maybeSingle();
  if (!sub) await a.from("myr_subscriptions").insert({ landlord_id: me, plan: "free" });
  await a.from("profiles").update({ primary_role: "landlord" }).eq("id", me);
  return { ok: true };
}

export async function landlordMe(me: string) {
  const a = await admin();
  if (!(await isLandlord(a, me))) return { landlord: false as const };
  const { data: p } = await a
    .from("profiles")
    .select("full_name, business_name, upi_id, phone, mobile")
    .eq("id", me)
    .maybeSingle();
  return {
    landlord: true as const,
    name: p?.business_name || p?.full_name || null,
    upi: p?.upi_id ?? null,
    phone: p?.phone ?? p?.mobile ?? null,
    canVerifyPayments: await entitled(me, "payment_verification"),
    canLivePhotos: await entitled(me, "live_feed_video"),
  };
}

export async function saveProfile(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const patch: Record<string, unknown> = {};
  if (body.full_name !== undefined) patch.full_name = str(body.full_name, 120) || null;
  if (body.business_name !== undefined) patch.business_name = str(body.business_name, 120) || null;
  if (body.upi_id !== undefined) {
    const u = str(body.upi_id, 80);
    if (u && !/^[\w.-]{2,}@[A-Za-z]{2,}$/.test(u))
      throw new Error("UPI ID looks wrong. Example: name@upi");
    patch.upi_id = u || null;
  }
  if (body.phone !== undefined) patch.phone = str(body.phone, 20) || null;
  const { error } = await a.from("profiles").update(patch).eq("id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- dashboard

export async function landlordHome(me: string) {
  const a = await admin();
  const [props, rooms, tenants, bills, pay, bookings, meters, tickets] = await Promise.all([
    a.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", me),
    a.from("rooms").select("id, capacity").eq("owner_id", me),
    a.from("tenants").select("id, room_id").eq("owner_id", me).eq("active", true),
    a
      .from("bills")
      .select("total_amount, amount_paid, status, due_date, paid_at")
      .eq("owner_id", me)
      .neq("status", "paid"),
    a
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", me)
      .in("verification_status", ["submitted", "pending"]),
    a
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("landlord_id", me)
      .eq("status", "pending"),
    a
      .from("meter_submissions")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", me)
      .eq("status", "pending"),
    a
      .from("maintenance_tickets")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", me)
      .in("status", ["open", "in_progress"]),
  ]);
  const beds = (rooms.data ?? []).reduce((s: number, r: any) => s + Number(r.capacity ?? 1), 0);
  const filled = (tenants.data ?? []).length;
  const today = d2(new Date());
  let due = 0,
    overdue = 0;
  for (const b of bills.data ?? []) {
    const left = Number(b.total_amount) - Number(b.amount_paid ?? 0);
    due += left;
    if (b.due_date && b.due_date < today) overdue += left;
  }
  const monthStart = d2(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { data: paidRows } = await a
    .from("bills")
    .select("amount_paid")
    .eq("owner_id", me)
    .gte("paid_at", monthStart);
  const collected = (paidRows ?? []).reduce(
    (s: number, b: any) => s + Number(b.amount_paid ?? 0),
    0,
  );
  const soon = d2(new Date(Date.now() + 7 * 864e5));
  const [{ data: upcoming }, { data: recent }] = await Promise.all([
    a
      .from("bills")
      .select("id, total_amount, amount_paid, due_date, tenants(name), rooms(room_number)")
      .eq("owner_id", me)
      .neq("status", "paid")
      .gte("due_date", today)
      .lte("due_date", soon)
      .order("due_date")
      .limit(5),
    a
      .from("myr_notifications")
      .select("id, title, body, created_at")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(5),
  ]);
  return {
    upcoming: (upcoming ?? []).map((b: any) => ({
      id: b.id,
      due_date: b.due_date,
      left: Number(b.total_amount) - Number(b.amount_paid ?? 0),
      tenant: b.tenants?.name ?? "Tenant",
      room: b.rooms?.room_number ?? "",
    })),
    recent: recent ?? [],
    properties: props.count ?? 0,
    rooms: (rooms.data ?? []).length,
    beds,
    filled,
    vacant: Math.max(0, beds - filled),
    due,
    overdue,
    collected,
    pending: {
      bookings: bookings.count ?? 0,
      payments: pay.count ?? 0,
      meters: meters.count ?? 0,
      tickets: tickets.count ?? 0,
    },
  };
}

// ---------------------------------------------------------------- properties + rooms

export async function listProperties(me: string) {
  const a = await admin();
  const [{ data: props }, { data: rooms }, { data: tenants }] = await Promise.all([
    a
      .from("properties")
      .select(
        "id, name, city, address, latitude, longitude, is_public_listing, myr_city, myr_address, myr_description, property_type, current_terms_version, terms_summary, verification_status",
      )
      .eq("owner_id", me)
      .order("created_at"),
    a
      .from("rooms")
      .select(
        "id, property_id, room_number, rent_amount, capacity, occupant_type, room_size, is_public, myr_available, myr_deposit, myr_amenities, myr_description, parking_kind, parking_vehicle, parking_covered, parking_reserved, parking_paid, parking_distance_m, parking_notes",
      )
      .eq("owner_id", me)
      .order("room_number"),
    a.from("tenants").select("id, room_id").eq("owner_id", me).eq("active", true),
  ]);
  const occ = new Map<string, number>();
  for (const t of tenants ?? []) occ.set(t.room_id, (occ.get(t.room_id) ?? 0) + 1);
  return {
    properties: (props ?? []).map((p: any) => {
      const t = TermsSchema.safeParse(p.terms_summary ?? {});
      const { terms_summary: _ts, ...rest } = p;
      return {
        ...rest,
        termsCompleteness: p.current_terms_version != null && t.success ? completeness(t.data) : 0,
        rooms: (rooms ?? [])
          .filter((r: any) => r.property_id === p.id)
          .map((r: any) => ({ ...r, occupied: occ.get(r.id) ?? 0 })),
      };
    }),
  };
}

export async function saveProperty(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const name = str(body.name, 120);
  if (name.length < 2) throw new Error("Property ka naam likhein.");
  const payload: Record<string, unknown> = {
    name,
    city: str(body.city, 80) || null,
    address: str(body.address, 400) || null,
    notes: str(body.notes, 300) || null,
    latitude: num(body.latitude),
    longitude: num(body.longitude),
  };
  if (body.id) {
    const id = uuid(body.id);
    const { data: own } = await a
      .from("properties")
      .select("id")
      .eq("id", id)
      .eq("owner_id", me)
      .maybeSingle();
    if (!own) throw new Error("Property not found.");
    const { error } = await a.from("properties").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { data, error } = await a
    .from("properties")
    .insert({ ...payload, owner_id: me })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string };
}

export async function deleteProperty(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { count } = await a
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me)
    .eq("active", true)
    .in(
      "room_id",
      (
        (await a.from("rooms").select("id").eq("property_id", id).eq("owner_id", me)).data ?? []
      ).map((r: any) => r.id),
    );
  if ((count ?? 0) > 0)
    throw new Error("Is property mein tenant rehte hain. Pehle unhe move-out karein.");
  const { error } = await a.from("properties").delete().eq("id", id).eq("owner_id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

const OCC = ["boys", "girls", "family", "anyone"];
const PARK_KINDS = ["dedicated", "shared", "nearby", "street", "none", "unspecified"];
const PARK_VEH = ["two_wheeler", "four_wheeler", "both"];

/** Same honesty rules as the DB constraints: public/nearby/none parking can never be shown as landlord-provided. */
export function parkingFields(body: Record<string, unknown>) {
  const kind = PARK_KINDS.includes(str(body.parking_kind, 20))
    ? str(body.parking_kind, 20)
    : "unspecified";
  const owned = kind === "dedicated" || kind === "shared";
  const dist = num(body.parking_distance_m);
  if (kind === "nearby" && (dist == null || dist < 0 || dist > 5000))
    throw new Error("Nearby parking ki doori 0 se 5000 meter ke beech likhein.");
  const vehicle = PARK_VEH.includes(str(body.parking_vehicle, 20))
    ? str(body.parking_vehicle, 20)
    : null;
  return {
    parking_kind: kind,
    parking_vehicle: kind === "none" || kind === "unspecified" ? null : vehicle,
    parking_covered: owned ? body.parking_covered === true : null,
    parking_reserved: owned ? body.parking_reserved === true : null,
    parking_paid: kind === "none" || kind === "unspecified" ? null : body.parking_paid === true,
    parking_distance_m: kind === "nearby" ? Math.round(dist as number) : null,
    parking_notes: kind === "unspecified" ? null : str(body.parking_notes, 200) || null,
  };
}
const SIZES = ["single_room", "shared_room", "1rk", "1bhk", "2bhk", "3bhk", "4bhk_plus"];

export async function saveRoom(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const property_id = uuid(body.property_id);
  const { data: own } = await a
    .from("properties")
    .select("id")
    .eq("id", property_id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!own) throw new Error("Property not found.");
  const room_number = str(body.room_number, 40);
  if (!room_number) throw new Error("Room number likhein.");
  const rent = num(body.rent_amount);
  if (rent == null || rent <= 0) throw new Error("Rent amount likhein.");
  const payload: Record<string, unknown> = {
    property_id,
    room_number,
    rent_amount: rent,
    water_per_person: num(body.water_per_person),
    cleaning_amount: num(body.cleaning_amount),
    notes: str(body.notes, 300) || null,
    capacity: Math.min(50, Math.max(1, Math.round(num(body.capacity) ?? 1))),
    occupant_type: OCC.includes(str(body.occupant_type, 20)) ? str(body.occupant_type, 20) : null,
    room_size: str(body.room_size, 20) || null,
    ...parkingFields(body),
  };
  if (body.id) {
    const id = uuid(body.id);
    const { data: r } = await a
      .from("rooms")
      .select("id")
      .eq("id", id)
      .eq("owner_id", me)
      .maybeSingle();
    if (!r) throw new Error("Room not found.");
    const { error } = await a.from("rooms").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { data, error } = await a
    .from("rooms")
    .insert({ ...payload, owner_id: me })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string };
}
export const ROOM_OPTIONS = { occupant: OCC, sizes: SIZES };

export async function deleteRoom(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { count } = await a
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", id)
    .eq("active", true)
    .eq("owner_id", me);
  if ((count ?? 0) > 0)
    throw new Error("Is room mein tenant rehte hain. Pehle unhe move-out karein.");
  const { error } = await a.from("rooms").delete().eq("id", id).eq("owner_id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- terms

export async function getTerms(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.property_id);
  const { data: p } = await a
    .from("properties")
    .select("id, name, owner_id, terms_summary, current_terms_version")
    .eq("id", id)
    .maybeSingle();
  if (!p || p.owner_id !== me) throw new Error("Property not found.");
  const terms = TermsSchema.parse(p.terms_summary ?? {});
  return {
    name: p.name as string,
    terms,
    version: (p.current_terms_version as number | null) ?? null,
    completeness: completeness(terms),
  };
}

/** Terms a tenant must be able to read + tick; these fields must be filled before any room goes live. */
export function missingTermFields(t: Terms): string[] {
  const m: string[] = [];
  if (t.gender === NS) m.push("Kis ke liye (boys/girls/anyone)");
  if (t.notice_period_days == null) m.push("Notice period");
  if (t.lock_in_months == null) m.push("Lock-in");
  if (t.deposit_refund_days == null) m.push("Deposit refund kitne din mein");
  if (t.electricity === NS) m.push("Bijli kaise charge hogi");
  if (t.visitors === NS) m.push("Visitors rule");
  if (t.smoking === NS) m.push("Smoking rule");
  if (t.pets === NS) m.push("Pets rule");
  if (!t.landlord_responsibilities.length) m.push("Landlord ki zimmedari (kam se kam 1)");
  if (!t.tenant_responsibilities.length) m.push("Tenant ki zimmedari (kam se kam 1)");
  return m;
}

export async function publishTerms(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const property = uuid(body.property_id);
  const parsed = TermsSchema.safeParse(body.terms);
  if (!parsed.success) throw new Error("Terms mein kuch galat hai. Fields dobara check karein.");
  const { data: own } = await a
    .from("properties")
    .select("id")
    .eq("id", property)
    .eq("owner_id", me)
    .maybeSingle();
  if (!own) throw new Error("Property not found.");
  const missing = missingTermFields(parsed.data);
  if (missing.length) throw new Error(`Ye bharna zaroori hai: ${missing.join(", ")}.`);
  const { data: res, error } = await a.rpc("publish_rental_terms", {
    _owner: me,
    _property: property,
    _terms: parsed.data,
    _completeness: completeness(parsed.data),
    _note: str(body.note, 300) || null,
  });
  if (error) throw new Error(cleanDb(error.message));
  try {
    const { data: pending } = await a
      .from("bookings")
      .select("tenant_user_id")
      .eq("property_id", property)
      .eq("status", "pending");
    for (const b of pending ?? [])
      await a.rpc("notify_user", {
        u: b.tenant_user_id,
        k: "booking_terms_changed",
        t: "Rental terms were updated",
        b: "The landlord updated the terms for a room you requested. What you accepted earlier is unchanged.",
        l: "/bookings",
      });
  } catch {
    /* best-effort */
  }
  return res as { id: string; version: number };
}

// ---------------------------------------------------------------- live photos

const MAX_DISTANCE_M = 50;
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000,
    rad = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(rad(lat2 - lat1) / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function target(body: Record<string, unknown>): { kind: "room" | "property"; id: string } {
  const kind = body.kind === "property" ? "property" : "room";
  return { kind, id: uuid(body.id) };
}

export async function listPhotos(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const t = target(body);
  const col = t.kind === "room" ? "room_id" : "property_id";
  const { data } = await a
    .from("live_feed_photos")
    .select("id, storage_path, verification_status, distance_m, created_at")
    .eq("owner_id", me)
    .eq(col, t.id)
    .order("created_at", { ascending: false });
  return {
    photos: (data ?? []).map((r: any) => ({
      ...r,
      url: a.storage.from("live-feed-photos").getPublicUrl(r.storage_path).data.publicUrl as string,
    })),
  };
}

export async function addPhoto(me: string, body: Record<string, unknown>) {
  await need(me, "live_feed_video");
  const a = await admin();
  const t = target(body);
  const path = str(body.storage_path, 300);
  if (path.length < 10 || !path.startsWith(`${me}/`)) throw new Error("Invalid photo path.");
  const clat = num(body.lat),
    clng = num(body.lng);
  if (clat == null || clng == null)
    throw new Error("Photo ke saath location chahiye. Location permission on karein.");
  let lat: number | null = null,
    lng: number | null = null;
  if (t.kind === "room") {
    const { data: r } = await a
      .from("rooms")
      .select("id, properties(latitude, longitude)")
      .eq("id", t.id)
      .eq("owner_id", me)
      .maybeSingle();
    if (!r) throw new Error("Room not found.");
    lat = r.properties?.latitude ?? null;
    lng = r.properties?.longitude ?? null;
  } else {
    const { data: p } = await a
      .from("properties")
      .select("latitude, longitude")
      .eq("id", t.id)
      .eq("owner_id", me)
      .maybeSingle();
    if (!p) throw new Error("Property not found.");
    lat = p.latitude ?? null;
    lng = p.longitude ?? null;
  }
  const col = t.kind === "room" ? "room_id" : "property_id";
  const { count } = await a
    .from("live_feed_photos")
    .select("id", { count: "exact", head: true })
    .eq(col, t.id)
    .neq("verification_status", "rejected");
  if ((count ?? 0) >= 12) throw new Error("Maximum 12 photos. Ek delete karke dusri add karein.");
  const distance = lat != null && lng != null ? haversine(clat, clng, lat, lng) : null;
  const status = distance == null ? "pending" : distance <= MAX_DISTANCE_M ? "verified" : "flagged";
  const { data: row, error } = await a
    .from("live_feed_photos")
    .insert({
      owner_id: me,
      [col]: t.id,
      storage_path: path,
      captured_lat: clat,
      captured_lng: clng,
      distance_m: distance,
      verification_status: status,
      expires_at: status === "verified" ? new Date(Date.now() + 150 * 864e5).toISOString() : null,
      reviewed_at: status === "verified" ? new Date().toISOString() : null,
    })
    .select("id, verification_status, distance_m")
    .single();
  if (error) throw new Error("Photo save nahi hui. Dobara try karein.");
  return row;
}

export async function deletePhoto(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { data: row } = await a
    .from("live_feed_photos")
    .select("storage_path")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!row) throw new Error("Photo not found.");
  await a.from("live_feed_photos").delete().eq("id", id);
  await a.storage.from("live-feed-photos").remove([row.storage_path]);
  return { ok: true };
}

// ---------------------------------------------------------------- listing checklist + publish

type Item = {
  key: string;
  label: string;
  done: boolean;
  hint?: string;
  fix: "property" | "room" | "terms" | "photos" | "profile" | "listing";
};

/** Everything that must be filled before a room can be shown to tenants. */
export async function listingChecklist(me: string, roomId: string) {
  const a = await admin();
  const { data: r } = await a
    .from("rooms")
    .select("*, properties(*)")
    .eq("id", roomId)
    .eq("owner_id", me)
    .maybeSingle();
  if (!r) throw new Error("Room not found.");
  const p = r.properties ?? {};
  const [{ data: prof }, canPhotos] = await Promise.all([
    a.from("profiles").select("upi_id").eq("id", me).maybeSingle(),
    entitled(me, "live_feed_video"),
  ]);
  const t = TermsSchema.safeParse(p.terms_summary ?? {});
  const termsOk = p.current_terms_version != null && t.success;
  const missingT = termsOk ? missingTermFields(t.data) : ["Terms abhi publish nahi hue"];
  const { count: photos } = await a
    .from("live_feed_photos")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me)
    .neq("verification_status", "rejected")
    .or(`room_id.eq.${r.id},property_id.eq.${p.id}`);
  const { count: okPhotos } = await a
    .from("live_feed_photos")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me)
    .eq("verification_status", "verified")
    .or(`room_id.eq.${r.id},property_id.eq.${p.id}`);
  const items: Item[] = [
    { key: "p_name", label: "Property ka naam", done: !!p.name, fix: "property" },
    { key: "p_city", label: "City", done: !!(p.city || p.myr_city), fix: "property" },
    {
      key: "p_addr",
      label: "Poora address",
      done: !!(p.address || p.myr_address),
      fix: "property",
    },
    {
      key: "p_geo",
      label: "Map location (Use current location)",
      done: p.latitude != null && p.longitude != null,
      hint: "Location se tenants 'near me' mein aapka room dekh paate hain aur photo verify hoti hai.",
      fix: "property",
    },
    {
      key: "p_type",
      label: "Property type (PG / Flat / Hostel…)",
      done: !!p.property_type,
      fix: "listing",
    },
    {
      key: "p_desc",
      label: "Property ka description (kam se kam 20 akshar)",
      done: (p.myr_description ?? "").trim().length >= 20,
      fix: "listing",
    },
    { key: "r_rent", label: "Rent", done: Number(r.rent_amount) > 0, fix: "room" },
    {
      key: "r_occ",
      label: "Kis ke liye (boys / girls / family)",
      done: !!r.occupant_type,
      fix: "room",
    },
    { key: "r_size", label: "Room size (1 RK, 1 BHK…)", done: !!r.room_size, fix: "room" },
    {
      key: "r_dep",
      label: "Security deposit (0 bhi chalega)",
      done: r.myr_deposit != null,
      fix: "listing",
    },
    {
      key: "r_amen",
      label: "Amenities (kam se kam 1)",
      done: Array.isArray(r.myr_amenities) && r.myr_amenities.length > 0,
      fix: "listing",
    },
    {
      key: "r_desc",
      label: "Room ka description (kam se kam 20 akshar)",
      done: (r.myr_description ?? "").trim().length >= 20,
      fix: "listing",
    },
    {
      key: "terms",
      label: "Rental terms (notice, lock-in, deposit refund, bijli, rules, zimmedari)",
      done: termsOk && missingT.length === 0,
      hint: missingT.length
        ? `Baaki: ${missingT.slice(0, 4).join(", ")}${missingT.length > 4 ? "…" : ""}`
        : undefined,
      fix: "terms",
    },
    {
      key: "upi",
      label: "UPI ID (tenant rent yahin bhejega)",
      done: !!prof?.upi_id,
      fix: "profile",
    },
  ];
  if (canPhotos)
    items.push({
      key: "photos",
      label: "Live photo (kam se kam 1, property par khade hokar)",
      done: (okPhotos ?? 0) > 0,
      hint:
        (photos ?? 0) > 0 && !okPhotos
          ? "Photo property se 50 m se door li gayi thi. Property par jaakar dobara kheenchein."
          : undefined,
      fix: "photos",
    });
  return {
    items,
    ready: items.every((i) => i.done),
    room: { id: r.id, number: r.room_number, published: !!r.is_public },
    property: { id: p.id, name: p.name },
    photosRequired: canPhotos,
  };
}

export async function getListing(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.room_id);
  const check = await listingChecklist(me, id);
  const { data: r } = await a
    .from("rooms")
    .select(
      "myr_amenities, myr_description, myr_deposit, is_public, myr_available, properties(myr_description, property_type, myr_city, myr_address, city, address)",
    )
    .eq("id", id)
    .maybeSingle();
  return {
    ...check,
    values: {
      amenities: (r?.myr_amenities ?? []) as string[],
      description: r?.myr_description ?? "",
      deposit: r?.myr_deposit ?? null,
      pDescription: r?.properties?.myr_description ?? "",
      propertyType: r?.properties?.property_type ?? null,
    },
  };
}

/** Saves listing details (does not publish). */
export async function saveListing(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const roomId = uuid(body.room_id);
  const { data: r } = await a
    .from("rooms")
    .select("id, property_id, properties(city, address, myr_city, myr_address)")
    .eq("id", roomId)
    .eq("owner_id", me)
    .maybeSingle();
  if (!r) throw new Error("Room not found.");
  const types = ["pg", "room", "flat", "hostel", "shared"];
  const pPatch: Record<string, unknown> = {};
  if (body.property_type !== undefined) {
    const pt = str(body.property_type, 20);
    if (!types.includes(pt)) throw new Error("Property type chunein.");
    pPatch.property_type = pt;
  }
  if (body.p_description !== undefined) pPatch.myr_description = str(body.p_description, 2000);
  // Public listing uses the property's own city + address.
  if (r.properties?.city && !r.properties?.myr_city) pPatch.myr_city = r.properties.city;
  if (r.properties?.address && !r.properties?.myr_address)
    pPatch.myr_address = r.properties.address;
  if (Object.keys(pPatch).length) {
    const { error } = await a
      .from("properties")
      .update(pPatch)
      .eq("id", r.property_id)
      .eq("owner_id", me);
    if (error) throw new Error(cleanDb(error.message));
  }
  const rPatch: Record<string, unknown> = {};
  if (Array.isArray(body.amenities))
    rPatch.myr_amenities = body.amenities
      .map((x) => str(x, 40))
      .filter(Boolean)
      .slice(0, 30);
  if (body.description !== undefined) rPatch.myr_description = str(body.description, 1000);
  if (body.deposit !== undefined) {
    const dep = num(body.deposit);
    if (dep == null || dep < 0) throw new Error("Deposit amount sahi likhein (0 bhi chalega).");
    rPatch.myr_deposit = dep;
  }
  if (Object.keys(rPatch).length) {
    const { error } = await a.from("rooms").update(rPatch).eq("id", roomId).eq("owner_id", me);
    if (error) throw new Error(cleanDb(error.message));
  }
  return listingChecklist(me, roomId);
}

export async function publishListing(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const roomId = uuid(body.room_id);
  const publish = body.publish !== false;
  const { data: r } = await a
    .from("rooms")
    .select("id, property_id")
    .eq("id", roomId)
    .eq("owner_id", me)
    .maybeSingle();
  if (!r) throw new Error("Room not found.");
  if (publish) {
    const c = await listingChecklist(me, roomId);
    const left = c.items.filter((i) => !i.done);
    if (left.length)
      throw new Error(
        `Publish se pehle ye bharna baaki hai: ${left.map((i) => i.label.split(" (")[0]).join(", ")}.`,
      );
    const { error: pe } = await a
      .from("properties")
      .update({ is_public_listing: true })
      .eq("id", r.property_id)
      .eq("owner_id", me);
    if (pe) throw new Error(cleanDb(pe.message));
  }
  const { error } = await a
    .from("rooms")
    .update({ is_public: publish, ...(publish ? { myr_available: true } : {}) })
    .eq("id", roomId)
    .eq("owner_id", me);
  if (error) {
    if (/ROOM_FULL/.test(error.message))
      throw new Error(
        "Room full hai, isliye publish nahi ho sakta. Tenant move-out hote hi ye apne aap dikhne lagega.",
      );
    if (/ROOM_PROFILE_INCOMPLETE/.test(error.message))
      throw new Error("Pehle 'kis ke liye' aur room size chunein.");
    throw new Error(cleanDb(error.message));
  }
  if (!publish) {
    // Property stays listed while any other room is still live.
    const { count } = await a
      .from("rooms")
      .select("id", { count: "exact", head: true })
      .eq("property_id", r.property_id)
      .eq("is_public", true);
    if (!count)
      await a
        .from("properties")
        .update({ is_public_listing: false })
        .eq("id", r.property_id)
        .eq("owner_id", me);
  }
  return { ok: true, published: publish };
}

// ---------------------------------------------------------------- booking requests

export async function listRequests(me: string) {
  const a = await admin();
  const { data } = await a
    .from("bookings")
    .select(
      "id, status, created_at, room_id, property_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, message, tenant_id, rooms(room_number, rent_amount), properties(name)",
    )
    .eq("landlord_id", me)
    .order("created_at", { ascending: false })
    .limit(100);
  const rows = data ?? [];
  const verified = new Set<string>();
  const status = new Map<
    string,
    { accepted: number | null; current: number | null; needs: boolean }
  >();
  if (rows.length) {
    const { data: docs } = await a
      .from("tenant_documents")
      .select("user_id")
      .in("user_id", [...new Set(rows.map((b: any) => b.tenant_user_id))])
      .eq("status", "verified")
      .neq("doc_type", "photo");
    for (const d of docs ?? []) verified.add(d.user_id);
    await Promise.all(
      rows
        .filter((b: any) => b.status === "pending" || b.status === "accepted")
        .map(async (b: any) => {
          const { data: s } = await a.rpc("terms_reaccept_status", { _booking: b.id });
          const x = (s ?? {}) as any;
          status.set(b.id, {
            accepted: x.accepted_version ?? null,
            current: x.current_version ?? null,
            needs: !!x.needs,
          });
        }),
    );
  }
  return {
    requests: rows.map((b: any) => ({
      ...b,
      verified: verified.has(b.tenant_user_id),
      terms: status.get(b.id) ?? null,
    })),
  };
}

export async function decideRequest(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.booking_id);
  const accept = body.decision === "accept";
  const { data: b } = await a
    .from("bookings")
    .select(
      "id, landlord_id, room_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, status",
    )
    .eq("id", id)
    .maybeSingle();
  if (!b || b.landlord_id !== me) throw new Error("Forbidden");
  if (b.status !== "pending") throw new Error("Ye request pehle hi decide ho chuki hai.");
  if (!accept) {
    await a
      .from("bookings")
      .update({ status: "rejected", decided_at: new Date().toISOString() })
      .eq("id", id);
    return { ok: true };
  }
  const { data: rr } = await a
    .from("rooms")
    .select("capacity, rent_amount")
    .eq("id", b.room_id)
    .maybeSingle();
  const { count: occ } = await a
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", b.room_id)
    .eq("active", true);
  if ((occ ?? 0) >= (rr?.capacity ?? 1))
    throw new Error("Room full hai. Request reject karein ya pehle jagah khali karein.");
  const { data: code } = await a.rpc("generate_tenant_code");
  const { data: t, error } = await a
    .from("tenants")
    .insert({
      owner_id: me,
      room_id: b.room_id,
      name: b.tenant_name,
      phone: b.tenant_mobile,
      email: b.tenant_email,
      persons: 1,
      move_in_date: iso(body.move_in_date) ?? d2(new Date()),
      rent_share: num(body.rent_share) ?? rr?.rent_amount ?? null,
      active: true,
      tenant_user_id: b.tenant_user_id,
      tenant_code: (code as string) ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  await a
    .from("bookings")
    .update({ status: "accepted", decided_at: new Date().toISOString(), tenant_id: t.id })
    .eq("id", id);
  const { count: now } = await a
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", b.room_id)
    .eq("active", true);
  if ((now ?? 0) >= (rr?.capacity ?? 1)) {
    const { data: others } = await a
      .from("bookings")
      .select("id, tenant_user_id")
      .eq("room_id", b.room_id)
      .eq("status", "pending")
      .neq("id", id);
    if (others?.length) {
      await a
        .from("bookings")
        .update({ status: "rejected", decided_at: new Date().toISOString() })
        .in(
          "id",
          others.map((o: any) => o.id),
        );
      await a.from("myr_notifications").insert(
        others.map((o: any) => ({
          user_id: o.tenant_user_id,
          kind: "booking_closed",
          title: "Room no longer available",
          body: "Another tenant booked this room. Browse similar rooms on Rentalos.",
          link: "/explore",
        })),
      );
    }
  }
  return { ok: true, tenant_id: t.id as string };
}

// ---------------------------------------------------------------- tenants

export async function listTenants(me: string) {
  const a = await admin();
  const { data } = await a
    .from("tenants")
    .select(
      "id, name, phone, email, persons, move_in_date, rent_share, active, tenant_code, tenant_user_id, initial_reading, rooms(id, room_number, rent_amount, properties(name))",
    )
    .eq("owner_id", me)
    .order("active", { ascending: false })
    .order("name")
    .limit(300);
  const ids = (data ?? []).map((t: any) => t.id);
  const due = new Map<string, number>();
  if (ids.length) {
    const { data: bills } = await a
      .from("bills")
      .select("tenant_id, total_amount, amount_paid")
      .in("tenant_id", ids)
      .neq("status", "paid");
    for (const b of bills ?? [])
      due.set(
        b.tenant_id,
        (due.get(b.tenant_id) ?? 0) + Number(b.total_amount) - Number(b.amount_paid ?? 0),
      );
  }
  return { tenants: (data ?? []).map((t: any) => ({ ...t, due: due.get(t.id) ?? 0 })) };
}

export async function saveTenant(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const name = str(body.name, 120);
  if (name.length < 2) throw new Error("Tenant ka naam likhein.");
  const phone = str(body.phone, 20).replace(/[^\d+]/g, "");
  if (phone.replace(/\D/g, "").length < 10) throw new Error("10 digit ka mobile number likhein.");
  const room_id = uuid(body.room_id);
  const { data: room } = await a
    .from("rooms")
    .select("id, capacity, rent_amount, occupant_type")
    .eq("id", room_id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!room) throw new Error("Room not found.");
  const gender = ["male", "female", "other"].includes(str(body.gender, 10))
    ? str(body.gender, 10)
    : null;
  const payload: Record<string, unknown> = {
    name,
    phone,
    email: str(body.email, 200) || null,
    room_id,
    persons: Math.max(1, Math.round(num(body.persons) ?? 1)),
    move_in_date: iso(body.move_in_date) ?? d2(new Date()),
    rent_share: num(body.rent_share) ?? room.rent_amount ?? null,
    initial_reading: num(body.initial_reading) ?? 0,
    ...(gender ? { gender } : {}),
  };
  const needsFit = (g: string | null) => {
    if (room.occupant_type === "boys" && g !== "male")
      throw new Error("Ye Boys room hai. Tenant ka gender Male hona chahiye.");
    if (room.occupant_type === "girls" && g !== "female")
      throw new Error("Ye Girls room hai. Tenant ka gender Female hona chahiye.");
  };
  if (body.id) {
    const id = uuid(body.id);
    const { data: own } = await a
      .from("tenants")
      .select("id, room_id, active, gender")
      .eq("id", id)
      .eq("owner_id", me)
      .maybeSingle();
    if (!own) throw new Error("Tenant not found.");
    if (own.active && own.room_id !== room_id) {
      const { count: occ } = await a
        .from("tenants")
        .select("id", { count: "exact", head: true })
        .eq("room_id", room_id)
        .eq("active", true);
      if ((occ ?? 0) >= (room.capacity ?? 1))
        throw new Error("Naya room full hai. Tenant ko wahan shift nahi kar sakte.");
    }
    if (own.room_id !== room_id || gender)
      needsFit(gender ?? (own as { gender?: string | null }).gender ?? null);
    const { error } = await a.from("tenants").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { count } = await a
    .from("tenants")
    .select("id", { count: "exact", head: true })
    .eq("room_id", room_id)
    .eq("active", true);
  if ((count ?? 0) >= (room.capacity ?? 1)) throw new Error("Room full hai.");
  needsFit(gender);
  const { data: code } = await a.rpc("generate_tenant_code");
  const { data, error } = await a
    .from("tenants")
    .insert({ ...payload, owner_id: me, active: true, tenant_code: (code as string) ?? null })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  if (Number(payload.initial_reading) > 0)
    await a
      .from("meter_readings")
      .insert({
        owner_id: me,
        room_id,
        reading: payload.initial_reading,
        reading_date: payload.move_in_date,
      })
      .then(
        () => null,
        () => null,
      );
  return { id: data.id as string };
}

/** Financial checklist shown before a tenant is moved out. */
export async function moveOutCheck(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { data: t } = await a
    .from("tenants")
    .select("id, name, room_id, active")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const [{ data: bills }, { data: dep }, { count: subs }, { count: pays }] = await Promise.all([
    a.from("bills").select("total_amount, amount_paid").eq("tenant_id", id).neq("status", "paid"),
    a
      .from("deposits")
      .select("id, amount_held")
      .eq("tenant_id", id)
      .eq("owner_id", me)
      .eq("status", "held")
      .maybeSingle(),
    a
      .from("meter_submissions")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", id)
      .eq("status", "pending"),
    a
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", me)
      .in("verification_status", ["submitted", "pending"])
      .in(
        "bill_id",
        ((await a.from("bills").select("id").eq("tenant_id", id)).data ?? []).map((x: any) => x.id),
      ),
  ]);
  const due = (bills ?? []).reduce(
    (s2: number, x: any) => s2 + Number(x.total_amount) - Number(x.amount_paid ?? 0),
    0,
  );
  return {
    name: t.name as string,
    active: !!t.active,
    unpaidBills: (bills ?? []).length,
    due,
    depositHeld: dep ? Number(dep.amount_held) : null,
    pendingMeter: subs ?? 0,
    pendingPayments: pays ?? 0,
  };
}

export async function moveOut(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const chk = await moveOutCheck(me, { id });
  if (!chk.active) throw new Error("Ye tenant pehle hi move-out ho chuka hai.");
  if (chk.pendingPayments > 0)
    throw new Error(
      "Is tenant ke payment proof verify hone baaki hain. Pehle unhe verify/reject karein.",
    );
  if (chk.due > 0 && body.force_unpaid !== true)
    throw new Error("UNPAID: is tenant ke bill baaki hain. Confirm karke hi move-out karein.");
  const { error } = await a
    .from("tenants")
    .update({ active: false })
    .eq("id", id)
    .eq("owner_id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true, due: chk.due, depositHeld: chk.depositHeld };
}

// ---------------------------------------------------------------- bills + payments

export async function listBills(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const filter = str(body.filter, 10);
  let q = a
    .from("bills")
    .select(
      "id, status, total_amount, amount_paid, due_date, rent_period_start, rent_period_end, tenant_id, room_id, tenants(name, phone), rooms(room_number)",
    )
    .eq("owner_id", me)
    .order("created_at", { ascending: false })
    .limit(150);
  if (filter === "due") q = q.neq("status", "paid");
  const { data } = await q;
  return { bills: data ?? [] };
}

/** Starting values for the "new bill" form: latest APPROVED reading, rates, rent period — same maths as web. */
export async function billDraft(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const { data: t } = await a
    .from("tenants")
    .select(
      "id, name, room_id, persons, move_in_date, rent_share, initial_reading, rooms(id, room_number, rent_amount, water_per_person, cleaning_amount)",
    )
    .eq("id", tid)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const [{ data: st }, { data: reads }, { data: open }, { data: roomTenants }] = await Promise.all([
    a
      .from("settings")
      .select("electricity_per_unit, water_per_person, cleaning_amount")
      .eq("owner_id", me)
      .limit(1)
      .maybeSingle(),
    a
      .from("meter_readings")
      .select("reading, reading_date")
      .eq("room_id", t.room_id)
      .order("reading_date", { ascending: false })
      .limit(2),
    a.from("bills").select("total_amount, amount_paid").eq("tenant_id", tid).neq("status", "paid"),
    a.from("tenants").select("persons").eq("room_id", t.room_id).eq("active", true),
  ]);
  const r = anniversaryRange(t.move_in_date ?? d2(new Date()));
  const latest = reads?.[0],
    prev = reads?.[1];
  const seedPrev = prev?.reading ?? t.initial_reading ?? 0;
  return {
    tenant: { id: t.id, name: t.name },
    room: t.rooms?.room_number,
    rent_period_start: d2(r.rentStart),
    rent_period_end: d2(r.rentEnd),
    elec_period_start: d2(r.elecStart),
    elec_period_end: d2(r.elecEnd),
    due_date: d2(
      new Date(r.rentStart.getFullYear(), r.rentStart.getMonth(), r.rentStart.getDate() + 5),
    ),
    rent_amount: Number(t.rent_share ?? t.rooms?.rent_amount ?? 0),
    prev_reading: Number(seedPrev),
    curr_reading: Number(latest?.reading ?? seedPrev),
    electricity_per_unit: Number(st?.electricity_per_unit ?? 10),
    persons: (roomTenants ?? []).reduce((s: number, x: any) => s + Number(x.persons ?? 1), 0) || 1,
    water_per_person: Number(t.rooms?.water_per_person ?? st?.water_per_person ?? 0),
    cleaning_amount: Number(t.rooms?.cleaning_amount ?? st?.cleaning_amount ?? 0),
    previous_dues: (open ?? []).reduce(
      (s: number, b: any) => s + Number(b.total_amount) - Number(b.amount_paid ?? 0),
      0,
    ),
  };
}

export async function createBill(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const { data: t } = await a
    .from("tenants")
    .select("id, room_id")
    .eq("id", tid)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const n = (k: string) => Math.max(0, num(body[k]) ?? 0);
  const rs = iso(body.rent_period_start),
    re = iso(body.rent_period_end),
    es = iso(body.elec_period_start),
    ee = iso(body.elec_period_end),
    due = iso(body.due_date);
  if (!rs || !re || !es || !ee || !due) throw new Error("Saari dates chunein.");
  const { data: dup } = await a
    .from("bills")
    .select("id")
    .eq("tenant_id", tid)
    .eq("rent_period_start", rs)
    .maybeSingle();
  if (dup) throw new Error("Is tenant ka is rent period ka bill pehle se bana hua hai.");
  const prev = n("prev_reading"),
    curr = n("curr_reading");
  if (curr < prev) throw new Error("Current reading pichli reading se kam nahi ho sakti.");
  const units = curr - prev;
  const rate = n("electricity_per_unit");
  const elec = units * rate;
  const persons = Math.max(1, Math.round(n("persons") || 1));
  const water = persons * n("water_per_person");
  const total =
    n("rent_amount") +
    elec +
    water +
    n("cleaning_amount") +
    n("other_charges") +
    n("previous_dues");
  const { data, error } = await a
    .from("bills")
    .insert({
      owner_id: me,
      room_id: t.room_id,
      tenant_id: tid,
      rent_period_start: rs,
      rent_period_end: re,
      rent_amount: n("rent_amount"),
      elec_period_start: es,
      elec_period_end: ee,
      prev_reading: prev,
      curr_reading: curr,
      units_consumed: units,
      electricity_amount: elec,
      persons,
      water_amount: water,
      cleaning_amount: n("cleaning_amount"),
      other_charges: n("other_charges"),
      other_charges_note: str(body.other_charges_note, 200) || null,
      previous_dues: n("previous_dues"),
      total_amount: total,
      due_date: due,
      status: "pending",
      amount_paid: 0,
    })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string, total };
}

export async function markPaid(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.bill_id);
  const { data: b } = await a
    .from("bills")
    .select("id, owner_id, total_amount, amount_paid, status")
    .eq("id", id)
    .maybeSingle();
  if (!b || b.owner_id !== me) throw new Error("Bill not found.");
  const amt = num(body.amount) ?? Number(b.total_amount) - Number(b.amount_paid ?? 0);
  if (amt <= 0) throw new Error("Amount sahi likhein.");
  if (b.status === "paid") throw new Error("Ye bill pehle hi paid hai.");
  if (amt > Number(b.total_amount) - Number(b.amount_paid ?? 0) + 0.001)
    throw new Error("Amount baaki rakam se zyada hai.");
  const method = ["cash", "upi", "bank", "other"].includes(str(body.method, 10))
    ? str(body.method, 10)
    : "cash";
  const paid = Number(b.amount_paid ?? 0) + amt;
  const status = paid >= Number(b.total_amount) ? "paid" : "partial";
  await a.from("payments").insert({
    owner_id: me,
    bill_id: id,
    amount: amt,
    method,
    note: str(body.note, 200) || null,
    verification_status: "verified",
    verified_at: new Date().toISOString(),
    verified_by: me,
  });
  await a
    .from("bills")
    .update({
      amount_paid: paid,
      status,
      paid_at: status === "paid" ? new Date().toISOString() : null,
    })
    .eq("id", id);
  return { ok: true, status };
}

export async function listPendingPayments(me: string) {
  const a = await admin();
  const { data: pays } = await a
    .from("payments")
    .select("id, amount, upi_ref, screenshot_path, created_at, note, bill_id, tenant_user_id")
    .eq("owner_id", me)
    .in("verification_status", ["submitted", "pending"])
    .order("created_at", { ascending: false })
    .limit(50);
  const billIds = [...new Set((pays ?? []).map((p: any) => p.bill_id).filter(Boolean))];
  const { data: bills } = billIds.length
    ? await a
        .from("bills")
        .select(
          "id, total_amount, amount_paid, rent_period_start, tenants(name, phone), rooms(room_number)",
        )
        .in("id", billIds)
    : { data: [] as any[] };
  const bm = new Map((bills ?? []).map((b: any) => [b.id, b]));
  const out = [];
  for (const p of pays ?? []) {
    let shot: string | null = null;
    if (p.screenshot_path) {
      const { data: s } = await a.storage
        .from("payment-proofs")
        .createSignedUrl(p.screenshot_path, 600);
      shot = s?.signedUrl ?? null;
    }
    out.push({ ...p, screenshot: shot, bill: bm.get(p.bill_id) ?? null });
  }
  return { payments: out, allowed: await entitled(me, "payment_verification") };
}

export async function decidePayment(me: string, body: Record<string, unknown>) {
  await need(me, "payment_verification");
  const a = await admin();
  const id = uuid(body.payment_id);
  const { data: p } = await a
    .from("payments")
    .select("id, owner_id, bill_id, amount, verification_status")
    .eq("id", id)
    .maybeSingle();
  if (!p || p.owner_id !== me) throw new Error("Forbidden");
  if (p.verification_status === "verified") throw new Error("Ye pehle hi verify ho chuka hai.");
  const now = new Date().toISOString();
  if (body.decision !== "verify") {
    await a
      .from("payments")
      .update({ verification_status: "rejected", verified_at: now, verified_by: me })
      .eq("id", id);
    return { ok: true };
  }
  const { data: bill } = await a
    .from("bills")
    .select("id, total_amount, amount_paid")
    .eq("id", p.bill_id)
    .single();
  if (!bill) throw new Error("Bill missing");
  const paid = Number(bill.amount_paid ?? 0) + Number(p.amount);
  const status = paid >= Number(bill.total_amount) ? "paid" : "partial";
  await a
    .from("bills")
    .update({ amount_paid: paid, status, paid_at: status === "paid" ? now : null })
    .eq("id", bill.id);
  await a
    .from("payments")
    .update({ verification_status: "verified", verified_at: now, verified_by: me })
    .eq("id", id);
  return { ok: true, status };
}

// ---------------------------------------------------------------- meters

export async function listMeters(me: string) {
  const a = await admin();
  const { data } = await a
    .from("meter_submissions")
    .select("id, reading, note, photo_path, created_at, tenants(name), rooms(room_number, id)")
    .eq("owner_id", me)
    .eq("status", "pending")
    .order("created_at")
    .limit(50);
  const out = [];
  for (const s of data ?? []) {
    let photo: string | null = null;
    if (s.photo_path)
      photo =
        (await a.storage.from("meter-photos").createSignedUrl(s.photo_path, 600)).data?.signedUrl ??
        null;
    const { data: last } = await a
      .from("meter_readings")
      .select("reading")
      .eq("room_id", s.rooms?.id)
      .order("reading_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    out.push({
      id: s.id,
      reading: Number(s.reading),
      note: s.note,
      createdAt: s.created_at,
      tenant: s.tenants?.name ?? "Tenant",
      room: s.rooms?.room_number ?? "",
      last: last ? Number(last.reading) : null,
      photo,
    });
  }
  return { submissions: out };
}

export async function decideMeter(me: string, body: Record<string, unknown>) {
  const a = await admin();
  if (body.reading != null) {
    const r = typeof body.reading === "number" ? String(body.reading) : str(body.reading, 20);
    if (!/^\d+(\.\d{1,2})?$/.test(r) || Number(r) > 9_999_999.99)
      throw new Error("Reading sahi format mein likhein (jaise 12345.6, comma nahi).");
  }
  const { data: res, error } = await a.rpc("decide_meter_submission", {
    _owner: me,
    _id: uuid(body.id),
    _approve: body.approve === true,
    _reading: num(body.reading),
    _note: str(body.note, 300) || null,
  });
  if (error) throw new Error(cleanDb(error.message));
  try {
    const { data: s } = await a
      .from("meter_submissions")
      .select("submitted_by, approved_reading")
      .eq("id", uuid(body.id))
      .maybeSingle();
    if (s?.submitted_by)
      await a.from("myr_notifications").insert({
        user_id: s.submitted_by,
        kind: "meter_decided",
        title: body.approve === true ? "Meter reading approved" : "Meter reading rejected",
        body:
          body.approve === true
            ? `Your owner approved the reading (${Number(s.approved_reading)}). It will be used in your bill.`
            : "Your owner didn't accept the reading. Please submit it again.",
        link: "/meter",
      });
  } catch {
    /* best-effort */
  }
  return res as { status: string };
}

/** Rooms grouped for the guided meter picker: property → room, with tenant and last approved reading. */
export async function meterOverview(me: string) {
  const a = await admin();
  const [{ data: props }, { data: rooms }, { data: tenants }, { data: reads }, { data: subs }] =
    await Promise.all([
      a.from("properties").select("id, name, city").eq("owner_id", me).order("name"),
      a
        .from("rooms")
        .select("id, property_id, room_number")
        .eq("owner_id", me)
        .order("room_number"),
      a.from("tenants").select("room_id, name").eq("owner_id", me).eq("active", true),
      a
        .from("meter_readings")
        .select("room_id, reading, reading_date, created_at")
        .eq("owner_id", me)
        .order("reading_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000),
      a.from("meter_submissions").select("room_id").eq("owner_id", me).eq("status", "pending"),
    ]);
  const last = new Map<string, { reading: number; date: string }>();
  for (const r of reads ?? [])
    if (!last.has(r.room_id))
      last.set(r.room_id, { reading: Number(r.reading), date: r.reading_date });
  const pending = new Map<string, number>();
  for (const s of subs ?? []) pending.set(s.room_id, (pending.get(s.room_id) ?? 0) + 1);
  return {
    properties: (props ?? []).map((p: any) => ({
      ...p,
      rooms: (rooms ?? [])
        .filter((r: any) => r.property_id === p.id)
        .map((r: any) => ({
          id: r.id,
          number: r.room_number,
          tenants: (tenants ?? []).filter((t: any) => t.room_id === r.id).map((t: any) => t.name),
          last: last.get(r.id) ?? null,
          pending: pending.get(r.id) ?? 0,
        })),
    })),
  };
}

/** Everything shown BEFORE a reading is typed: where it belongs, last approved reading, history by status. */
export async function meterContext(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const room_id = uuid(body.room_id);
  const { data: room } = await a
    .from("rooms")
    .select("id, room_number, properties(name, city)")
    .eq("id", room_id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!room) throw new Error("Room not found.");
  const [{ data: tenants }, { data: reads }, { data: subs }] = await Promise.all([
    a.from("tenants").select("name").eq("room_id", room_id).eq("active", true),
    a
      .from("meter_readings")
      .select("id, reading, reading_date, notes, ai_detected, created_at")
      .eq("room_id", room_id)
      .order("reading_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(12),
    a
      .from("meter_submissions")
      .select("id, reading, approved_reading, status, created_at, landlord_note, tenants(name)")
      .eq("room_id", room_id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const list = reads ?? [];
  const typical =
    list.length >= 2
      ? Math.round((Number(list[0].reading) - Number(list[1].reading)) * 100) / 100
      : null;
  return {
    property: room.properties?.name ?? "",
    city: room.properties?.city ?? null,
    room: room.room_number,
    tenants: (tenants ?? []).map((t: any) => t.name),
    last: list[0] ? { reading: Number(list[0].reading), date: list[0].reading_date } : null,
    typicalDelta: typical !== null && typical > 0 ? typical : null,
    existingDates: list.map((r: any) => r.reading_date as string),
    readings: list.map((r: any, i: number) => ({
      id: r.id,
      reading: Number(r.reading),
      date: r.reading_date,
      status: "approved",
      usage: list[i + 1]
        ? Math.round((Number(r.reading) - Number(list[i + 1].reading)) * 100) / 100
        : null,
      exception: /^Exception:/.test(r.notes ?? ""),
      ocr: !!r.ai_detected,
    })),
    submissions: (subs ?? []).map((s: any) => ({
      id: s.id,
      reading: Number(s.reading),
      approved: s.approved_reading != null ? Number(s.approved_reading) : null,
      status: s.status,
      date: s.created_at,
      note: s.landlord_note,
      tenant: s.tenants?.name ?? null,
    })),
  };
}

/** Landlord enters a reading. Rules are enforced HERE; the app's checks are only for instant feedback. */
export async function addMeterReading(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const room_id = uuid(body.room_id);
  const { data: r } = await a
    .from("rooms")
    .select("id")
    .eq("id", room_id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!r) throw new Error("Room not found.");
  const ctx = await meterContext(me, { room_id });
  const today = d2(new Date());
  const date = iso(body.date) ?? today;
  const raw = typeof body.reading === "number" ? String(body.reading) : str(body.reading, 20);
  const { checkMeterReading } = await import("./meter-validation");
  const chk = checkMeterReading({
    raw,
    prev: ctx.last?.reading ?? null,
    date,
    today,
    existingDates: ctx.existingDates,
    typicalDelta: ctx.typicalDelta,
    reason: str(body.reason, 300),
    confirmHigh: body.confirm_high === true,
  });
  if (chk.value == null) throw new Error(chk.errors[0] ?? "Reading likhein.");
  if (!chk.ok) throw new Error(chk.errors[0]);
  const photo = str(body.photo_path, 300) || null;
  if (photo && !photo.startsWith(`${me}/`)) throw new Error("Invalid photo.");
  const lat = num(body.photo_lat);
  const lng = num(body.photo_lng);
  const geo =
    photo && lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180
      ? { photo_lat: lat, photo_lng: lng }
      : {};
  const parts: string[] = [];
  if (chk.needsReason)
    parts.push(`Exception: lower than previous (${ctx.last?.reading}) — ${str(body.reason, 300)}`);
  if (chk.needsConfirmHigh) parts.push(`High jump confirmed by landlord (+${chk.delta})`);
  const { data, error } = await a
    .from("meter_readings")
    .insert({
      owner_id: me,
      room_id,
      reading: chk.value,
      reading_date: date,
      photo_path: photo,
      ai_detected: body.ai_detected === true,
      notes: parts.length ? parts.join(" | ") : null,
      ...geo,
    })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true, id: data.id as string, usage: chk.delta, warnings: chk.warnings };
}

/** Optional OCR (same model, entitlement and rate limit as the web). Result is only a suggestion the landlord must confirm. */
export async function meterOcr(me: string, body: Record<string, unknown>) {
  await (async () => {
    const { requireEntitlement } = await import("./subscription/entitlements");
    await requireEntitlement(me, "ai_meter_ocr" as never);
  })();
  const a = await admin();
  const b64 = typeof body.image_base64 === "string" ? body.image_base64 : "";
  if (b64.length < 100 || b64.length > 8_000_000) throw new Error("Photo sahi nahi hai.");
  const since = new Date(Date.now() - 60_000).toISOString();
  const { count } = await a
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", me)
    .eq("kind", "meter_ocr")
    .gte("created_at", since);
  if ((count ?? 0) >= 10) throw new Error("Bahut zyada requests. 1 minute baad try karein.");
  await a.from("ai_usage_events").insert({ owner_id: me, kind: "meter_ocr" });
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("OCR is time available nahi hai. Reading haath se likhein.");
  const { generateText } = await import("ai");
  const { createLovableAiGatewayProvider } = await import("./ai-gateway");
  const { text } = await generateText({
    model: createLovableAiGatewayProvider(key)("google/gemini-2.5-flash"),
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "You are reading an electricity meter. Return ONLY the black-digit integer reading shown on the display. Ignore any red digit. Respond with just the number, nothing else. If unreadable, respond with 0.",
          },
          { type: "image", image: `data:image/jpeg;base64,${b64}` },
        ],
      },
    ],
  });
  const n = parseFloat(text.replace(/[^\d.]/g, ""));
  return {
    reading: Number.isFinite(n) && n > 0 ? n : null,
    note: "OCR sirf kaale (black) digits padhta hai. Laal digit (decimal) aap khud likhein aur number meter se milakar confirm karein.",
  };
}

// ---------------------------------------------------------------- complaints

export async function landlordTickets(me: string) {
  const a = await admin();
  const { data } = await a
    .from("maintenance_tickets")
    .select(
      "id, title, description, status, priority, created_at, photo_paths, resolution_notes, tenants(name), rooms(room_number)",
    )
    .eq("owner_id", me)
    .order("created_at", { ascending: false })
    .limit(100);
  const out = [];
  for (const t of data ?? []) {
    const photos: string[] = [];
    for (const p of ((t.photo_paths ?? []) as string[]).slice(0, 4)) {
      const { data: sg } = await a.storage.from("ticket-photos").createSignedUrl(p, 3600);
      if (sg?.signedUrl) photos.push(sg.signedUrl);
    }
    out.push({ ...t, photos });
  }
  return { tickets: out };
}

export async function setTicketStatus(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const status = str(body.status, 20);
  if (!["open", "in_progress", "resolved", "closed"].includes(status))
    throw new Error("Invalid status.");
  const { data: t } = await a
    .from("maintenance_tickets")
    .select("id")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Ticket not found.");
  const patch: Record<string, unknown> = { status };
  if (str(body.note, 2000)) patch.resolution_notes = str(body.note, 2000);
  if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
  const { error } = await a.from("maintenance_tickets").update(patch).eq("id", id);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- billing defaults (Settings screen)

export async function getBillingDefaults(me: string) {
  const a = await admin();
  const { data } = await a
    .from("settings")
    .select("electricity_per_unit, water_per_person, cleaning_amount")
    .eq("owner_id", me)
    .limit(1)
    .maybeSingle();
  return {
    electricity_per_unit: Number(data?.electricity_per_unit ?? 10),
    water_per_person: Number(data?.water_per_person ?? 0),
    cleaning_amount: Number(data?.cleaning_amount ?? 0),
  };
}

export async function saveBillingDefaults(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const v = (k: string) => {
    const x = num(body[k]);
    if (x == null || x < 0 || x > 100000) throw new Error("Rate / amount sahi likhein.");
    return x;
  };
  const patch = {
    electricity_per_unit: v("electricity_per_unit"),
    water_per_person: v("water_per_person"),
    cleaning_amount: v("cleaning_amount"),
  };
  const { data: row } = await a
    .from("settings")
    .select("id")
    .eq("owner_id", me)
    .limit(1)
    .maybeSingle();
  const { error } = row
    ? await a.from("settings").update(patch).eq("id", row.id)
    : await a.from("settings").insert({ ...patch, owner_id: me });
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- deposits

export async function listDeposits(me: string) {
  const a = await admin();
  const { data } = await a
    .from("deposits")
    .select(
      "id, tenant_id, amount_held, amount_deducted, amount_refunded, deduction_reason, status, refunded_at, created_at, tenants(name, phone, active)",
    )
    .eq("owner_id", me)
    .order("created_at", { ascending: false })
    .limit(200);
  return { deposits: data ?? [] };
}

export async function createDeposit(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const amt = num(body.amount_held);
  if (amt == null || amt < 0) throw new Error("Deposit amount sahi likhein.");
  const { data: t } = await a
    .from("tenants")
    .select("id")
    .eq("id", tid)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const { data: dup } = await a
    .from("deposits")
    .select("id")
    .eq("tenant_id", tid)
    .eq("owner_id", me)
    .eq("status", "held")
    .maybeSingle();
  if (dup) throw new Error("Is tenant ka deposit pehle se 'held' hai.");
  const { error } = await a
    .from("deposits")
    .insert({ owner_id: me, tenant_id: tid, amount_held: amt, status: "held" });
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

export async function settleDeposit(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { data: d0 } = await a
    .from("deposits")
    .select("amount_held, status")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!d0) throw new Error("Deposit not found.");
  if (d0.status !== "held") throw new Error("Ye deposit pehle hi settle ho chuka hai.");
  const ded = num(body.amount_deducted) ?? 0;
  if (ded < 0 || ded > Number(d0.amount_held))
    throw new Error("Katauti deposit se zyada nahi ho sakti.");
  const refund = Number(d0.amount_held) - ded;
  const status =
    ded >= Number(d0.amount_held) ? "forfeited" : ded > 0 ? "partial_refunded" : "refunded";
  const reason = str(body.deduction_reason, 1000) || null;
  if (ded > 0 && !reason) throw new Error("Katauti ki wajah likhein.");
  const { error } = await a
    .from("deposits")
    .update({
      amount_deducted: ded,
      amount_refunded: refund,
      deduction_reason: reason,
      status,
      refunded_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw new Error(cleanDb(error.message));
  return { refunded: refund, status };
}

// ---------------------------------------------------------------- move-in / move-out records

export async function listMoves(me: string) {
  const a = await admin();
  const { data } = await a
    .from("move_records")
    .select(
      "id, kind, move_date, meter_reading, condition_notes, checklist, tenants(name), rooms(room_number)",
    )
    .eq("owner_id", me)
    .order("move_date", { ascending: false })
    .limit(100);
  return { moves: data ?? [] };
}

export async function createMove(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const { data: t } = await a
    .from("tenants")
    .select("id, room_id")
    .eq("id", tid)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const kind = body.kind === "move_out" ? "move_out" : "move_in";
  const date = iso(body.move_date);
  if (!date) throw new Error("Date chunein.");
  const checklist: Record<string, boolean> = {};
  if (body.checklist && typeof body.checklist === "object")
    for (const [k, v] of Object.entries(body.checklist as Record<string, unknown>).slice(0, 20))
      checklist[str(k, 40)] = v === true;
  const { error } = await a.from("move_records").insert({
    owner_id: me,
    tenant_id: tid,
    room_id: t.room_id,
    kind,
    move_date: date,
    meter_reading: num(body.meter_reading),
    condition_notes: str(body.condition_notes, 2000) || null,
    photo_paths: [],
    checklist,
  });
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- subscription (read-only) + verification status

export async function subscriptionInfo(me: string) {
  const a = await admin();
  const { getUserEntitlements } = await import("./subscription/entitlements");
  const ent = await getUserEntitlements(me);
  const [plans, feats, pe, pays] = await Promise.all([
    a
      .from("subscription_plans")
      .select("id, code, name, description, price_inr, billing_months, sort_order")
      .eq("public_visible", true)
      .order("sort_order"),
    a
      .from("feature_catalog")
      .select("feature_key, label, description, kind")
      .eq("visible", true)
      .order("sort_order"),
    a.from("plan_entitlements").select("*"),
    a
      .from("subscription_payments")
      .select("id, plan_id, amount, status, submitted_at, reviewed_at, admin_note")
      .eq("user_id", me)
      .order("submitted_at", { ascending: false })
      .limit(10),
  ]);
  return {
    entitlements: ent,
    plans: plans.data ?? [],
    features: feats.data ?? [],
    planEntitlements: pe.data ?? [],
    payments: pays.data ?? [],
  };
}

export async function verificationStatus(me: string) {
  const a = await admin();
  const [{ data: props }, { data: mine }] = await Promise.all([
    a
      .from("properties")
      .select("id, name, verification_status, verified_at")
      .eq("owner_id", me)
      .order("name"),
    a
      .from("myr_verifications")
      .select("id, kind, status, rejection_reason, created_at, reviewed_at")
      .eq("user_id", me)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  return { properties: props ?? [], requests: mine ?? [] };
}

// ---------------------------------------------------------------- bill detail, PDF, manual WhatsApp

const rupees = (n: number) =>
  "₹" + (Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });
const dmyText = (d: string | null | undefined) =>
  d
    ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "-";

async function loadOwnBill(me: string, id: string) {
  const a = await admin();
  const { data: b } = await a
    .from("bills")
    .select("*, tenants(name, phone, email), rooms(room_number)")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!b) throw new Error("Bill not found.");
  const { data: profile } = await a.from("profiles").select("*").eq("id", me).maybeSingle();
  return { a, b, profile };
}

function waMessage(b: any, profile: any, pdfUrl: string | null) {
  const from = profile?.business_name || profile?.full_name || "";
  const bal = Number(b.total_amount) - Number(b.amount_paid ?? 0);
  const pay = profile?.upi_id
    ? `\n\n💳 UPI: ${profile.upi_id}`
    : profile?.bank_details
      ? `\n\n💳 Bank details:\n${profile.bank_details}`
      : "";
  return (
    `Hello ${b.tenants?.name ?? ""},\n\n` +
    `🏠 Room ${b.rooms?.room_number ?? ""} — ${dmyText(b.rent_period_start)} – ${dmyText(b.rent_period_end)}\n` +
    `Rent: ${rupees(b.rent_amount)}\n` +
    `⚡ Electricity: ${rupees(b.electricity_amount)} (${b.units_consumed} units)\n` +
    `💧 Water: ${rupees(b.water_amount)}\n🧹 Cleaning: ${rupees(b.cleaning_amount)}\n` +
    (Number(b.other_charges) > 0 ? `Other: ${rupees(b.other_charges)}\n` : "") +
    (Number(b.previous_dues) > 0 ? `📌 Previous dues: ${rupees(b.previous_dues)}\n` : "") +
    `\n💰 Total: ${rupees(b.total_amount)}` +
    (Number(b.amount_paid) > 0
      ? `\n✅ Paid: ${rupees(b.amount_paid)}\n🔴 Balance: ${rupees(bal)}`
      : "") +
    `\n📆 Due: ${dmyText(b.due_date)}` +
    pay +
    (pdfUrl ? `\n\n📄 Bill PDF: ${pdfUrl}` : "") +
    `\n\nThank you${from ? `,\n${from}` : "."}`
  );
}

/** Indian mobile → wa.me digits (adds 91 for 10-digit numbers). null if unusable. */
export function waDigits(phone: string | null | undefined): string | null {
  const d = String(phone ?? "").replace(/\D/g, "");
  if (d.length === 10) return "91" + d;
  if (d.length === 12 && d.startsWith("91")) return d;
  if (d.length === 11 && d.startsWith("0")) return "91" + d.slice(1);
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export async function billDetail(me: string, body: Record<string, unknown>) {
  const { a, b, profile } = await loadOwnBill(me, uuid(body.bill_id));
  const { data: payments } = await a
    .from("payments")
    .select("id, amount, method, note, paid_on, verification_status, created_at")
    .eq("bill_id", b.id)
    .order("created_at", { ascending: false });
  return {
    bill: b,
    payments: payments ?? [],
    whatsapp_ready: !!waDigits(b.tenants?.phone),
    has_upi: !!profile?.upi_id,
  };
}

/** Builds the PDF on the server, stores it privately, returns a 24h signed link + ready-to-open WhatsApp link. */
export async function billPdf(me: string, body: Record<string, unknown>) {
  const { a, b, profile } = await loadOwnBill(me, uuid(body.bill_id));
  const { generateBillPdfBytes } = await import("./pdf");
  const bytes = await generateBillPdfBytes(b as any, profile as any);
  const path = `${me}/${b.id}-${Date.now()}.pdf`;
  const up = await a.storage.from("bill-pdfs").upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (up.error) throw new Error("PDF save nahi hua. Dobara try karein.");
  const signed = await a.storage.from("bill-pdfs").createSignedUrl(path, 60 * 60 * 24);
  if (signed.error || !signed.data) throw new Error("PDF link nahi bana. Dobara try karein.");
  const url = signed.data.signedUrl;
  const digits = waDigits(b.tenants?.phone);
  const message = waMessage(b, profile, url);
  return {
    pdf_url: url,
    file_name: `Bill-Room${b.rooms?.room_number ?? ""}-${b.rent_period_start}.pdf`,
    message,
    whatsapp_url: digits ? `https://wa.me/${digits}?text=${encodeURIComponent(message)}` : null,
  };
}

/** WhatsApp text-only (no PDF generation) — manual send via the owner's own WhatsApp. */
export async function billWhatsApp(me: string, body: Record<string, unknown>) {
  const { b, profile } = await loadOwnBill(me, uuid(body.bill_id));
  const digits = waDigits(b.tenants?.phone);
  if (!digits) throw new Error("Tenant ka phone number sahi nahi hai.");
  const message = waMessage(b, profile, null);
  return { message, whatsapp_url: `https://wa.me/${digits}?text=${encodeURIComponent(message)}` };
}

// ---------------------------------------------------------------- bill: pause reminders / delete

export async function billPauseReminders(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.bill_id);
  const until = str(body.until, 10);
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new Error("Date YYYY-MM-DD mein likhein.");
  if (until && until < new Date().toISOString().slice(0, 10))
    throw new Error("Date aaj ya aage ki rakhein.");
  const { data: b } = await a
    .from("bills")
    .select("id")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!b) throw new Error("Bill not found.");
  await a
    .from("bills")
    .update({ reminders_paused_until: until || null })
    .eq("id", id);
  return { ok: true };
}

/** Only a bill with no money recorded can be deleted — keeps the ledger honest. */
export async function billDelete(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.bill_id);
  const { data: b } = await a
    .from("bills")
    .select("id, amount_paid")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!b) throw new Error("Bill not found.");
  const { data: pays } = await a.from("payments").select("id").eq("bill_id", id).limit(1);
  if (Number(b.amount_paid ?? 0) > 0 || (pays ?? []).length)
    throw new Error("Is bill par payment record hai, isliye delete nahi ho sakta.");
  await a.from("bills").delete().eq("id", id);
  return { ok: true };
}

// ---------------------------------------------------------------- tenant statement

export async function tenantStatement(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.tenant_id);
  const { data: t } = await a
    .from("tenants")
    .select("id, name, phone, active, rent_share, move_in_date, rooms(room_number)")
    .eq("id", id)
    .eq("owner_id", me)
    .maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const { data: bills } = await a
    .from("bills")
    .select("id, rent_period_start, due_date, total_amount, amount_paid, status")
    .eq("tenant_id", id)
    .eq("owner_id", me)
    .order("rent_period_start", { ascending: false })
    .limit(60);
  const rows = bills ?? [];
  const billed = rows.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
  const paid = rows.reduce((s: number, r: any) => s + Number(r.amount_paid ?? 0), 0);
  return { tenant: t, bills: rows, billed, paid, due: Math.max(0, billed - paid) };
}

// ---------------------------------------------------------------- terms history

export async function termsHistory(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const pid = uuid(body.property_id);
  const { data: p } = await a
    .from("properties")
    .select("id, name, current_terms_version")
    .eq("id", pid)
    .eq("owner_id", me)
    .maybeSingle();
  if (!p) throw new Error("Property not found.");
  const { data: vs } = await a
    .from("rental_terms_versions")
    .select("version, completeness, change_note, created_at")
    .eq("property_id", pid)
    .order("version", { ascending: false })
    .limit(30);
  const { data: acc } = await a
    .from("booking_terms_acceptances")
    .select("terms_version")
    .eq("property_id", pid)
    .eq("landlord_id", me);
  const { data: re } = await a
    .from("booking_terms_reacceptances")
    .select("terms_version")
    .eq("property_id", pid)
    .eq("landlord_id", me);
  const counts: Record<number, number> = {};
  for (const r of [...(acc ?? []), ...(re ?? [])] as any[])
    if (r.terms_version != null) counts[r.terms_version] = (counts[r.terms_version] ?? 0) + 1;
  return {
    property: p,
    versions: (vs ?? []).map((v: any) => ({ ...v, acceptances: counts[v.version] ?? 0 })),
  };
}

// ---------------------------------------------------------------- WhatsApp link status (read-only)

export async function whatsappStatus(me: string) {
  const a = await admin();
  const { data } = await a
    .from("whatsapp_links")
    .select("phone_e164, verified, opted_in")
    .eq("user_id", me)
    .maybeSingle();
  const { isMetaConfigured } = await import("./whatsapp/meta-client");
  return {
    linked: !!data?.verified,
    opted_in: !!data?.opted_in,
    phone_masked: data?.phone_e164 ? String(data.phone_e164).replace(/\d(?=\d{3})/g, "•") : null,
    live_delivery: isMetaConfigured(),
  };
}

// ---------------------------------------------------------------- partner CSV import (verified partner orgs only)

const PartnerRow = z.object({
  property_external_ref_id: z.string().trim().min(1),
  property_name: z.string().trim().min(1),
  city: z.string().trim().optional(),
  address: z.string().trim().optional(),
  room_external_ref_id: z.string().trim().min(1),
  room_number: z.string().trim().min(1),
  rent_amount: z.number().nonnegative().max(10_000_000),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
});

export async function partnerStatus(me: string) {
  const a = await admin();
  const { data: m } = await a
    .from("partner_org_members")
    .select("org_id, partner_organizations(id, name, verified)")
    .eq("user_id", me)
    .maybeSingle();
  const org = (m as any)?.partner_organizations ?? null;
  return { org, allowed: !!org && (await entitled(me, "partner_import")) };
}

export async function partnerImport(me: string, body: Record<string, unknown>) {
  const a = await admin();
  await need(me, "partner_import");
  const { data: m } = await a
    .from("partner_org_members")
    .select("org_id")
    .eq("user_id", me)
    .maybeSingle();
  if (!m) throw new Error("Aapka account kisi partner organization se linked nahi hai.");
  const Papa = (await import("papaparse")).default;
  const parsed = Papa.parse<Record<string, string>>(str(body.csv, 400_000), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h: string) => h.trim(),
  });
  const errors: string[] = [];
  const rows: z.infer<typeof PartnerRow>[] = [];
  parsed.data.slice(0, 500).forEach((r, i) => {
    const res = PartnerRow.safeParse({
      ...r,
      rent_amount: Number(String(r.rent_amount ?? "").replace(/[^\d.]/g, "")),
      amenities: r.amenities
        ? r.amenities
            .split(/[;|]/)
            .map((x) => x.trim())
            .filter(Boolean)
        : [],
    });
    if (res.success) rows.push(res.data);
    else errors.push(`Row ${i + 2}: ${res.error.issues[0]?.path.join(".")} sahi nahi hai`);
  });
  if (!rows.length) throw new Error(errors[0] ?? "CSV mein koi valid row nahi mili.");
  if (body.dry_run) return { dry_run: true, valid_rows: rows.length, errors };
  const byProp = new Map<string, typeof rows>();
  for (const r of rows)
    byProp.set(r.property_external_ref_id, [...(byProp.get(r.property_external_ref_id) ?? []), r]);
  let propertiesUpserted = 0;
  let roomsUpserted = 0;
  for (const [ext, rs] of byProp) {
    const f = rs[0];
    const { data: prop, error } = await a
      .from("properties")
      .upsert(
        {
          owner_id: me,
          name: f.property_name,
          city: f.city ?? null,
          address: f.address ?? null,
          source: "partner",
          partner_org_id: m.org_id,
          external_ref_id: ext,
          is_public_listing: true,
          verification_status: "verified",
          property_type: "flat",
        },
        { onConflict: "partner_org_id,external_ref_id" },
      )
      .select("id")
      .single();
    if (error || !prop) {
      errors.push(`Property "${f.property_name}": ${cleanDb(error?.message ?? "failed")}`);
      continue;
    }
    propertiesUpserted++;
    for (const r of rs) {
      const { error: e2 } = await a.from("rooms").upsert(
        {
          owner_id: me,
          property_id: prop.id,
          room_number: r.room_number,
          rent_amount: r.rent_amount,
          myr_description: r.description ?? null,
          myr_amenities: r.amenities ?? [],
          source: "partner",
          partner_org_id: m.org_id,
          external_ref_id: r.room_external_ref_id,
          is_public: true,
          myr_available: true,
        },
        { onConflict: "partner_org_id,external_ref_id" },
      );
      if (e2) errors.push(`Room "${r.room_number}": ${cleanDb(e2.message)}`);
      else roomsUpserted++;
    }
  }
  return { propertiesUpserted, roomsUpserted, errors };
}
