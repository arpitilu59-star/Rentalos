/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
/**
 * Landlord features of the RentDesk app (/api/app/l/*). Same ownership + subscription rules as the web
 * server functions; the app additionally forces a COMPLETE listing (property, room, photos, terms)
 * before a room can be published.
 */
import { TermsSchema, completeness, NS, type Terms } from "./terms/schema";
import { anniversaryRange } from "./db";

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
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
const d2 = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

async function admin() {
  const { getAdmin } = await import("./whatsapp/db");
  return (await getAdmin()) as any;
}
async function entitled(me: string, f: "payment_verification" | "live_feed_video"): Promise<boolean> {
  const { hasEntitlement } = await import("./subscription/entitlements");
  return hasEntitlement(me, f);
}
async function need(me: string, f: "payment_verification" | "live_feed_video") {
  const { requireEntitlement } = await import("./subscription/entitlements");
  await requireEntitlement(me, f);
}

// ---------------------------------------------------------------- gate

/** A landlord account = has the landlord role or already owns a property. Tenants are kept out. */
export async function isLandlord(a: any, me: string): Promise<boolean> {
  const [{ data: role }, { count }] = await Promise.all([
    a.from("myr_user_roles").select("user_id").eq("user_id", me).eq("role", "landlord").maybeSingle(),
    a.from("properties").select("id", { count: "exact", head: true }).eq("owner_id", me),
  ]);
  return !!role || (count ?? 0) > 0;
}

/** Called right after RentDesk sign-up: marks the new account as a landlord (same as web landlord signup). */
export async function claimLandlord(me: string) {
  const a = await admin();
  // A person who already rents a room as a tenant keeps that; landlord role is simply added.
  await a.from("myr_user_roles").upsert({ user_id: me, role: "landlord" }, { onConflict: "user_id,role" });
  const { data: existing } = await a.from("myr_user_profiles").select("user_id").eq("user_id", me).maybeSingle();
  if (!existing) {
    const { data: prof } = await a.from("profiles").select("full_name").eq("id", me).maybeSingle();
    await a.from("myr_user_profiles").insert({ user_id: me, display_name: prof?.full_name ?? null });
  }
  const { data: sub } = await a.from("myr_subscriptions").select("id").eq("landlord_id", me).maybeSingle();
  if (!sub) await a.from("myr_subscriptions").insert({ landlord_id: me, plan: "free" });
  await a.from("profiles").update({ primary_role: "landlord" }).eq("id", me);
  return { ok: true };
}

export async function landlordMe(me: string) {
  const a = await admin();
  if (!(await isLandlord(a, me))) return { landlord: false as const };
  const { data: p } = await a.from("profiles").select("full_name, business_name, upi_id, phone, mobile").eq("id", me).maybeSingle();
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
    if (u && !/^[\w.\-]{2,}@[A-Za-z]{2,}$/.test(u)) throw new Error("UPI ID looks wrong. Example: name@upi");
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
    a.from("bills").select("total_amount, amount_paid, status, due_date, paid_at").eq("owner_id", me).neq("status", "paid"),
    a.from("payments").select("id", { count: "exact", head: true }).eq("owner_id", me).in("verification_status", ["submitted", "pending"]),
    a.from("bookings").select("id", { count: "exact", head: true }).eq("landlord_id", me).eq("status", "pending"),
    a.from("meter_submissions").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("status", "pending"),
    a.from("maintenance_tickets").select("id", { count: "exact", head: true }).eq("owner_id", me).in("status", ["open", "in_progress"]),
  ]);
  const beds = (rooms.data ?? []).reduce((s: number, r: any) => s + Number(r.capacity ?? 1), 0);
  const filled = (tenants.data ?? []).length;
  const today = d2(new Date());
  let due = 0, overdue = 0;
  for (const b of bills.data ?? []) {
    const left = Number(b.total_amount) - Number(b.amount_paid ?? 0);
    due += left;
    if (b.due_date && b.due_date < today) overdue += left;
  }
  const monthStart = d2(new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const { data: paidRows } = await a.from("bills").select("amount_paid").eq("owner_id", me).gte("paid_at", monthStart);
  const collected = (paidRows ?? []).reduce((s: number, b: any) => s + Number(b.amount_paid ?? 0), 0);
  return {
    properties: props.count ?? 0,
    rooms: (rooms.data ?? []).length,
    beds, filled, vacant: Math.max(0, beds - filled),
    due, overdue, collected,
    pending: { bookings: bookings.count ?? 0, payments: pay.count ?? 0, meters: meters.count ?? 0, tickets: tickets.count ?? 0 },
  };
}

// ---------------------------------------------------------------- properties + rooms

export async function listProperties(me: string) {
  const a = await admin();
  const [{ data: props }, { data: rooms }, { data: tenants }] = await Promise.all([
    a.from("properties").select("id, name, city, address, latitude, longitude, is_public_listing, myr_city, myr_address, myr_description, property_type, current_terms_version, terms_summary, verification_status").eq("owner_id", me).order("created_at"),
    a.from("rooms").select("id, property_id, room_number, rent_amount, capacity, occupant_type, room_size, is_public, myr_available, myr_deposit, myr_amenities, myr_description").eq("owner_id", me).order("room_number"),
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
        rooms: (rooms ?? []).filter((r: any) => r.property_id === p.id).map((r: any) => ({ ...r, occupied: occ.get(r.id) ?? 0 })),
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
    const { data: own } = await a.from("properties").select("id").eq("id", id).eq("owner_id", me).maybeSingle();
    if (!own) throw new Error("Property not found.");
    const { error } = await a.from("properties").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { data, error } = await a.from("properties").insert({ ...payload, owner_id: me }).select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string };
}

export async function deleteProperty(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { count } = await a.from("tenants").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("active", true).in("room_id", ((await a.from("rooms").select("id").eq("property_id", id).eq("owner_id", me)).data ?? []).map((r: any) => r.id));
  if ((count ?? 0) > 0) throw new Error("Is property mein tenant rehte hain. Pehle unhe move-out karein.");
  const { error } = await a.from("properties").delete().eq("id", id).eq("owner_id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

const OCC = ["boys", "girls", "family", "anyone"];
const SIZES = ["single_room", "shared_room", "1rk", "1bhk", "2bhk", "3bhk", "4bhk_plus"];

export async function saveRoom(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const property_id = uuid(body.property_id);
  const { data: own } = await a.from("properties").select("id").eq("id", property_id).eq("owner_id", me).maybeSingle();
  if (!own) throw new Error("Property not found.");
  const room_number = str(body.room_number, 40);
  if (!room_number) throw new Error("Room number likhein.");
  const rent = num(body.rent_amount);
  if (rent == null || rent <= 0) throw new Error("Rent amount likhein.");
  const payload: Record<string, unknown> = {
    property_id, room_number, rent_amount: rent,
    water_per_person: num(body.water_per_person), cleaning_amount: num(body.cleaning_amount),
    notes: str(body.notes, 300) || null,
    capacity: Math.min(50, Math.max(1, Math.round(num(body.capacity) ?? 1))),
    occupant_type: OCC.includes(str(body.occupant_type, 20)) ? str(body.occupant_type, 20) : null,
    room_size: str(body.room_size, 20) || null,
  };
  if (body.id) {
    const id = uuid(body.id);
    const { data: r } = await a.from("rooms").select("id").eq("id", id).eq("owner_id", me).maybeSingle();
    if (!r) throw new Error("Room not found.");
    const { error } = await a.from("rooms").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { data, error } = await a.from("rooms").insert({ ...payload, owner_id: me }).select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string };
}
export const ROOM_OPTIONS = { occupant: OCC, sizes: SIZES };

export async function deleteRoom(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { count } = await a.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", id).eq("active", true).eq("owner_id", me);
  if ((count ?? 0) > 0) throw new Error("Is room mein tenant rehte hain. Pehle unhe move-out karein.");
  const { error } = await a.from("rooms").delete().eq("id", id).eq("owner_id", me);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- terms

export async function getTerms(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.property_id);
  const { data: p } = await a.from("properties").select("id, name, owner_id, terms_summary, current_terms_version").eq("id", id).maybeSingle();
  if (!p || p.owner_id !== me) throw new Error("Property not found.");
  const terms = TermsSchema.parse(p.terms_summary ?? {});
  return { name: p.name as string, terms, version: (p.current_terms_version as number | null) ?? null, completeness: completeness(terms) };
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
  const { data: own } = await a.from("properties").select("id").eq("id", property).eq("owner_id", me).maybeSingle();
  if (!own) throw new Error("Property not found.");
  const missing = missingTermFields(parsed.data);
  if (missing.length) throw new Error(`Ye bharna zaroori hai: ${missing.join(", ")}.`);
  const { data: res, error } = await a.rpc("publish_rental_terms", {
    _owner: me, _property: property, _terms: parsed.data, _completeness: completeness(parsed.data), _note: str(body.note, 300) || null,
  });
  if (error) throw new Error(cleanDb(error.message));
  try {
    const { data: pending } = await a.from("bookings").select("tenant_user_id").eq("property_id", property).eq("status", "pending");
    for (const b of pending ?? [])
      await a.rpc("notify_user", {
        u: b.tenant_user_id, k: "booking_terms_changed", t: "Rental terms were updated",
        b: "The landlord updated the terms for a room you requested. What you accepted earlier is unchanged.", l: "/bookings",
      });
  } catch { /* best-effort */ }
  return res as { id: string; version: number };
}

// ---------------------------------------------------------------- live photos

const MAX_DISTANCE_M = 50;
function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, rad = (x: number) => (x * Math.PI) / 180;
  const h = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
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
  const { data } = await a.from("live_feed_photos").select("id, storage_path, verification_status, distance_m, created_at").eq("owner_id", me).eq(col, t.id).order("created_at", { ascending: false });
  return {
    photos: (data ?? []).map((r: any) => ({ ...r, url: a.storage.from("live-feed-photos").getPublicUrl(r.storage_path).data.publicUrl as string })),
  };
}

export async function addPhoto(me: string, body: Record<string, unknown>) {
  await need(me, "live_feed_video");
  const a = await admin();
  const t = target(body);
  const path = str(body.storage_path, 300);
  if (path.length < 10 || !path.startsWith(`${me}/`)) throw new Error("Invalid photo path.");
  const clat = num(body.lat), clng = num(body.lng);
  if (clat == null || clng == null) throw new Error("Photo ke saath location chahiye. Location permission on karein.");
  let lat: number | null = null, lng: number | null = null;
  if (t.kind === "room") {
    const { data: r } = await a.from("rooms").select("id, properties(latitude, longitude)").eq("id", t.id).eq("owner_id", me).maybeSingle();
    if (!r) throw new Error("Room not found.");
    lat = r.properties?.latitude ?? null; lng = r.properties?.longitude ?? null;
  } else {
    const { data: p } = await a.from("properties").select("latitude, longitude").eq("id", t.id).eq("owner_id", me).maybeSingle();
    if (!p) throw new Error("Property not found.");
    lat = p.latitude ?? null; lng = p.longitude ?? null;
  }
  const col = t.kind === "room" ? "room_id" : "property_id";
  const { count } = await a.from("live_feed_photos").select("id", { count: "exact", head: true }).eq(col, t.id).neq("verification_status", "rejected");
  if ((count ?? 0) >= 12) throw new Error("Maximum 12 photos. Ek delete karke dusri add karein.");
  const distance = lat != null && lng != null ? haversine(clat, clng, lat, lng) : null;
  const status = distance == null ? "pending" : distance <= MAX_DISTANCE_M ? "verified" : "flagged";
  const { data: row, error } = await a.from("live_feed_photos").insert({
    owner_id: me, [col]: t.id, storage_path: path, captured_lat: clat, captured_lng: clng, distance_m: distance,
    verification_status: status,
    expires_at: status === "verified" ? new Date(Date.now() + 150 * 864e5).toISOString() : null,
    reviewed_at: status === "verified" ? new Date().toISOString() : null,
  }).select("id, verification_status, distance_m").single();
  if (error) throw new Error("Photo save nahi hui. Dobara try karein.");
  return row;
}

export async function deletePhoto(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { data: row } = await a.from("live_feed_photos").select("storage_path").eq("id", id).eq("owner_id", me).maybeSingle();
  if (!row) throw new Error("Photo not found.");
  await a.from("live_feed_photos").delete().eq("id", id);
  await a.storage.from("live-feed-photos").remove([row.storage_path]);
  return { ok: true };
}

// ---------------------------------------------------------------- listing checklist + publish

type Item = { key: string; label: string; done: boolean; hint?: string; fix: "property" | "room" | "terms" | "photos" | "profile" | "listing" };

/** Everything that must be filled before a room can be shown to tenants. */
export async function listingChecklist(me: string, roomId: string) {
  const a = await admin();
  const { data: r } = await a.from("rooms").select("*, properties(*)").eq("id", roomId).eq("owner_id", me).maybeSingle();
  if (!r) throw new Error("Room not found.");
  const p = r.properties ?? {};
  const [{ data: prof }, canPhotos] = await Promise.all([
    a.from("profiles").select("upi_id").eq("id", me).maybeSingle(),
    entitled(me, "live_feed_video"),
  ]);
  const t = TermsSchema.safeParse(p.terms_summary ?? {});
  const termsOk = p.current_terms_version != null && t.success;
  const missingT = termsOk ? missingTermFields(t.data) : ["Terms abhi publish nahi hue"];
  const { count: photos } = await a.from("live_feed_photos").select("id", { count: "exact", head: true }).eq("owner_id", me).neq("verification_status", "rejected").or(`room_id.eq.${r.id},property_id.eq.${p.id}`);
  const { count: okPhotos } = await a.from("live_feed_photos").select("id", { count: "exact", head: true }).eq("owner_id", me).eq("verification_status", "verified").or(`room_id.eq.${r.id},property_id.eq.${p.id}`);
  const items: Item[] = [
    { key: "p_name", label: "Property ka naam", done: !!p.name, fix: "property" },
    { key: "p_city", label: "City", done: !!(p.city || p.myr_city), fix: "property" },
    { key: "p_addr", label: "Poora address", done: !!(p.address || p.myr_address), fix: "property" },
    { key: "p_geo", label: "Map location (Use current location)", done: p.latitude != null && p.longitude != null, hint: "Location se tenants 'near me' mein aapka room dekh paate hain aur photo verify hoti hai.", fix: "property" },
    { key: "p_type", label: "Property type (PG / Flat / Hostel…)", done: !!p.property_type, fix: "listing" },
    { key: "p_desc", label: "Property ka description (kam se kam 20 akshar)", done: (p.myr_description ?? "").trim().length >= 20, fix: "listing" },
    { key: "r_rent", label: "Rent", done: Number(r.rent_amount) > 0, fix: "room" },
    { key: "r_occ", label: "Kis ke liye (boys / girls / family)", done: !!r.occupant_type, fix: "room" },
    { key: "r_size", label: "Room size (1 RK, 1 BHK…)", done: !!r.room_size, fix: "room" },
    { key: "r_dep", label: "Security deposit (0 bhi chalega)", done: r.myr_deposit != null, fix: "listing" },
    { key: "r_amen", label: "Amenities (kam se kam 1)", done: Array.isArray(r.myr_amenities) && r.myr_amenities.length > 0, fix: "listing" },
    { key: "r_desc", label: "Room ka description (kam se kam 20 akshar)", done: (r.myr_description ?? "").trim().length >= 20, fix: "listing" },
    { key: "terms", label: "Rental terms (notice, lock-in, deposit refund, bijli, rules, zimmedari)", done: termsOk && missingT.length === 0, hint: missingT.length ? `Baaki: ${missingT.slice(0, 4).join(", ")}${missingT.length > 4 ? "…" : ""}` : undefined, fix: "terms" },
    { key: "upi", label: "UPI ID (tenant rent yahin bhejega)", done: !!prof?.upi_id, fix: "profile" },
  ];
  if (canPhotos)
    items.push({ key: "photos", label: "Live photo (kam se kam 1, property par khade hokar)", done: (okPhotos ?? 0) > 0, hint: (photos ?? 0) > 0 && !okPhotos ? "Photo property se 50 m se door li gayi thi. Property par jaakar dobara kheenchein." : undefined, fix: "photos" });
  return { items, ready: items.every((i) => i.done), room: { id: r.id, number: r.room_number, published: !!r.is_public }, property: { id: p.id, name: p.name }, photosRequired: canPhotos };
}

export async function getListing(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.room_id);
  const check = await listingChecklist(me, id);
  const { data: r } = await a.from("rooms").select("myr_amenities, myr_description, myr_deposit, is_public, myr_available, properties(myr_description, property_type, myr_city, myr_address, city, address)").eq("id", id).maybeSingle();
  return { ...check, values: {
    amenities: (r?.myr_amenities ?? []) as string[], description: r?.myr_description ?? "", deposit: r?.myr_deposit ?? null,
    pDescription: r?.properties?.myr_description ?? "", propertyType: r?.properties?.property_type ?? null,
  } };
}

/** Saves listing details (does not publish). */
export async function saveListing(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const roomId = uuid(body.room_id);
  const { data: r } = await a.from("rooms").select("id, property_id, properties(city, address, myr_city, myr_address)").eq("id", roomId).eq("owner_id", me).maybeSingle();
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
  if (r.properties?.address && !r.properties?.myr_address) pPatch.myr_address = r.properties.address;
  if (Object.keys(pPatch).length) {
    const { error } = await a.from("properties").update(pPatch).eq("id", r.property_id).eq("owner_id", me);
    if (error) throw new Error(cleanDb(error.message));
  }
  const rPatch: Record<string, unknown> = {};
  if (Array.isArray(body.amenities)) rPatch.myr_amenities = body.amenities.map((x) => str(x, 40)).filter(Boolean).slice(0, 30);
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
  const { data: r } = await a.from("rooms").select("id, property_id").eq("id", roomId).eq("owner_id", me).maybeSingle();
  if (!r) throw new Error("Room not found.");
  if (publish) {
    const c = await listingChecklist(me, roomId);
    const left = c.items.filter((i) => !i.done);
    if (left.length) throw new Error(`Publish se pehle ye bharna baaki hai: ${left.map((i) => i.label.split(" (")[0]).join(", ")}.`);
    const { error: pe } = await a.from("properties").update({ is_public_listing: true }).eq("id", r.property_id).eq("owner_id", me);
    if (pe) throw new Error(cleanDb(pe.message));
  }
  const { error } = await a.from("rooms").update({ is_public: publish, ...(publish ? { myr_available: true } : {}) }).eq("id", roomId).eq("owner_id", me);
  if (error) {
    if (/ROOM_FULL/.test(error.message)) throw new Error("Room full hai, isliye publish nahi ho sakta. Tenant move-out hote hi ye apne aap dikhne lagega.");
    if (/ROOM_PROFILE_INCOMPLETE/.test(error.message)) throw new Error("Pehle 'kis ke liye' aur room size chunein.");
    throw new Error(cleanDb(error.message));
  }
  if (!publish) {
    // Property stays listed while any other room is still live.
    const { count } = await a.from("rooms").select("id", { count: "exact", head: true }).eq("property_id", r.property_id).eq("is_public", true);
    if (!count) await a.from("properties").update({ is_public_listing: false }).eq("id", r.property_id).eq("owner_id", me);
  }
  return { ok: true, published: publish };
}

// ---------------------------------------------------------------- booking requests

export async function listRequests(me: string) {
  const a = await admin();
  const { data } = await a.from("bookings")
    .select("id, status, created_at, room_id, property_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, message, tenant_id, rooms(room_number, rent_amount), properties(name)")
    .eq("landlord_id", me).order("created_at", { ascending: false }).limit(100);
  const rows = data ?? [];
  const verified = new Set<string>();
  const status = new Map<string, { accepted: number | null; current: number | null; needs: boolean }>();
  if (rows.length) {
    const { data: docs } = await a.from("tenant_documents").select("user_id").in("user_id", [...new Set(rows.map((b: any) => b.tenant_user_id))]).eq("status", "verified").neq("doc_type", "photo");
    for (const d of docs ?? []) verified.add(d.user_id);
    await Promise.all(rows.filter((b: any) => b.status === "pending" || b.status === "accepted").map(async (b: any) => {
      const { data: s } = await a.rpc("terms_reaccept_status", { _booking: b.id });
      const x = (s ?? {}) as any;
      status.set(b.id, { accepted: x.accepted_version ?? null, current: x.current_version ?? null, needs: !!x.needs });
    }));
  }
  return { requests: rows.map((b: any) => ({ ...b, verified: verified.has(b.tenant_user_id), terms: status.get(b.id) ?? null })) };
}

export async function decideRequest(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.booking_id);
  const accept = body.decision === "accept";
  const { data: b } = await a.from("bookings").select("id, landlord_id, room_id, tenant_user_id, tenant_name, tenant_mobile, tenant_email, status").eq("id", id).maybeSingle();
  if (!b || b.landlord_id !== me) throw new Error("Forbidden");
  if (b.status !== "pending") throw new Error("Ye request pehle hi decide ho chuki hai.");
  if (!accept) {
    await a.from("bookings").update({ status: "rejected", decided_at: new Date().toISOString() }).eq("id", id);
    return { ok: true };
  }
  const { data: rr } = await a.from("rooms").select("capacity, rent_amount").eq("id", b.room_id).maybeSingle();
  const { count: occ } = await a.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", b.room_id).eq("active", true);
  if ((occ ?? 0) >= (rr?.capacity ?? 1)) throw new Error("Room full hai. Request reject karein ya pehle jagah khali karein.");
  const { data: code } = await a.rpc("generate_tenant_code");
  const { data: t, error } = await a.from("tenants").insert({
    owner_id: me, room_id: b.room_id, name: b.tenant_name, phone: b.tenant_mobile, email: b.tenant_email, persons: 1,
    move_in_date: iso(body.move_in_date) ?? d2(new Date()), rent_share: num(body.rent_share) ?? rr?.rent_amount ?? null,
    active: true, tenant_user_id: b.tenant_user_id, tenant_code: (code as string) ?? null,
  }).select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  await a.from("bookings").update({ status: "accepted", decided_at: new Date().toISOString(), tenant_id: t.id }).eq("id", id);
  const { count: now } = await a.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", b.room_id).eq("active", true);
  if ((now ?? 0) >= (rr?.capacity ?? 1)) {
    const { data: others } = await a.from("bookings").select("id, tenant_user_id").eq("room_id", b.room_id).eq("status", "pending").neq("id", id);
    if (others?.length) {
      await a.from("bookings").update({ status: "rejected", decided_at: new Date().toISOString() }).in("id", others.map((o: any) => o.id));
      await a.from("myr_notifications").insert(others.map((o: any) => ({ user_id: o.tenant_user_id, kind: "booking_closed", title: "Room no longer available", body: "Another tenant booked this room. Browse similar rooms on Rentalos.", link: "/explore" })));
    }
  }
  return { ok: true, tenant_id: t.id as string };
}

// ---------------------------------------------------------------- tenants

export async function listTenants(me: string) {
  const a = await admin();
  const { data } = await a.from("tenants")
    .select("id, name, phone, email, persons, move_in_date, rent_share, active, tenant_code, tenant_user_id, initial_reading, rooms(id, room_number, rent_amount, properties(name))")
    .eq("owner_id", me).order("active", { ascending: false }).order("name").limit(300);
  const ids = (data ?? []).map((t: any) => t.id);
  const due = new Map<string, number>();
  if (ids.length) {
    const { data: bills } = await a.from("bills").select("tenant_id, total_amount, amount_paid").in("tenant_id", ids).neq("status", "paid");
    for (const b of bills ?? []) due.set(b.tenant_id, (due.get(b.tenant_id) ?? 0) + Number(b.total_amount) - Number(b.amount_paid ?? 0));
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
  const { data: room } = await a.from("rooms").select("id, capacity, rent_amount").eq("id", room_id).eq("owner_id", me).maybeSingle();
  if (!room) throw new Error("Room not found.");
  const payload: Record<string, unknown> = {
    name, phone, email: str(body.email, 200) || null, room_id,
    persons: Math.max(1, Math.round(num(body.persons) ?? 1)),
    move_in_date: iso(body.move_in_date) ?? d2(new Date()),
    rent_share: num(body.rent_share) ?? room.rent_amount ?? null,
    initial_reading: num(body.initial_reading) ?? 0,
  };
  if (body.id) {
    const id = uuid(body.id);
    const { data: own } = await a.from("tenants").select("id").eq("id", id).eq("owner_id", me).maybeSingle();
    if (!own) throw new Error("Tenant not found.");
    const { error } = await a.from("tenants").update(payload).eq("id", id);
    if (error) throw new Error(cleanDb(error.message));
    return { id };
  }
  const { count } = await a.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", room_id).eq("active", true);
  if ((count ?? 0) >= (room.capacity ?? 1)) throw new Error("Room full hai.");
  const { data: code } = await a.rpc("generate_tenant_code");
  const { data, error } = await a.from("tenants").insert({ ...payload, owner_id: me, active: true, tenant_code: (code as string) ?? null }).select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  if (Number(payload.initial_reading) > 0)
    await a.from("meter_readings").insert({ owner_id: me, room_id, reading: payload.initial_reading, reading_date: payload.move_in_date }).then(() => null, () => null);
  return { id: data.id as string };
}

export async function moveOut(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.id);
  const { data: t } = await a.from("tenants").select("id").eq("id", id).eq("owner_id", me).maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const { error } = await a.from("tenants").update({ active: false }).eq("id", id);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- bills + payments

export async function listBills(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const filter = str(body.filter, 10);
  let q = a.from("bills").select("id, status, total_amount, amount_paid, due_date, rent_period_start, rent_period_end, tenant_id, room_id, tenants(name, phone), rooms(room_number)").eq("owner_id", me).order("created_at", { ascending: false }).limit(150);
  if (filter === "due") q = q.neq("status", "paid");
  const { data } = await q;
  return { bills: data ?? [] };
}

/** Starting values for the "new bill" form: latest APPROVED reading, rates, rent period — same maths as web. */
export async function billDraft(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const { data: t } = await a.from("tenants").select("id, name, room_id, persons, move_in_date, rent_share, initial_reading, rooms(id, room_number, rent_amount, water_per_person, cleaning_amount)").eq("id", tid).eq("owner_id", me).maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const [{ data: st }, { data: reads }, { data: open }, { data: roomTenants }] = await Promise.all([
    a.from("settings").select("electricity_per_unit, water_per_person, cleaning_amount").eq("owner_id", me).limit(1).maybeSingle(),
    a.from("meter_readings").select("reading, reading_date").eq("room_id", t.room_id).order("reading_date", { ascending: false }).limit(2),
    a.from("bills").select("total_amount, amount_paid").eq("tenant_id", tid).neq("status", "paid"),
    a.from("tenants").select("persons").eq("room_id", t.room_id).eq("active", true),
  ]);
  const r = anniversaryRange(t.move_in_date ?? d2(new Date()));
  const latest = reads?.[0], prev = reads?.[1];
  const seedPrev = prev?.reading ?? t.initial_reading ?? 0;
  return {
    tenant: { id: t.id, name: t.name }, room: t.rooms?.room_number,
    rent_period_start: d2(r.rentStart), rent_period_end: d2(r.rentEnd), elec_period_start: d2(r.elecStart), elec_period_end: d2(r.elecEnd),
    due_date: d2(new Date(r.rentStart.getFullYear(), r.rentStart.getMonth(), r.rentStart.getDate() + 5)),
    rent_amount: Number(t.rent_share ?? t.rooms?.rent_amount ?? 0),
    prev_reading: Number(seedPrev), curr_reading: Number(latest?.reading ?? seedPrev),
    electricity_per_unit: Number(st?.electricity_per_unit ?? 10),
    persons: (roomTenants ?? []).reduce((s: number, x: any) => s + Number(x.persons ?? 1), 0) || 1,
    water_per_person: Number(t.rooms?.water_per_person ?? st?.water_per_person ?? 0),
    cleaning_amount: Number(t.rooms?.cleaning_amount ?? st?.cleaning_amount ?? 0),
    previous_dues: (open ?? []).reduce((s: number, b: any) => s + Number(b.total_amount) - Number(b.amount_paid ?? 0), 0),
  };
}

export async function createBill(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const tid = uuid(body.tenant_id);
  const { data: t } = await a.from("tenants").select("id, room_id").eq("id", tid).eq("owner_id", me).maybeSingle();
  if (!t) throw new Error("Tenant not found.");
  const n = (k: string) => Math.max(0, num(body[k]) ?? 0);
  const rs = iso(body.rent_period_start), re = iso(body.rent_period_end), es = iso(body.elec_period_start), ee = iso(body.elec_period_end), due = iso(body.due_date);
  if (!rs || !re || !es || !ee || !due) throw new Error("Saari dates chunein.");
  const prev = n("prev_reading"), curr = n("curr_reading");
  if (curr < prev) throw new Error("Current reading pichli reading se kam nahi ho sakti.");
  const units = curr - prev;
  const rate = n("electricity_per_unit");
  const elec = units * rate;
  const persons = Math.max(1, Math.round(n("persons") || 1));
  const water = persons * n("water_per_person");
  const total = n("rent_amount") + elec + water + n("cleaning_amount") + n("other_charges") + n("previous_dues");
  const { data, error } = await a.from("bills").insert({
    owner_id: me, room_id: t.room_id, tenant_id: tid, rent_period_start: rs, rent_period_end: re, rent_amount: n("rent_amount"),
    elec_period_start: es, elec_period_end: ee, prev_reading: prev, curr_reading: curr, units_consumed: units, electricity_amount: elec,
    persons, water_amount: water, cleaning_amount: n("cleaning_amount"), other_charges: n("other_charges"), other_charges_note: str(body.other_charges_note, 200) || null,
    previous_dues: n("previous_dues"), total_amount: total, due_date: due, status: "pending", amount_paid: 0,
  }).select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  return { id: data.id as string, total };
}

export async function markPaid(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const id = uuid(body.bill_id);
  const { data: b } = await a.from("bills").select("id, owner_id, total_amount, amount_paid").eq("id", id).maybeSingle();
  if (!b || b.owner_id !== me) throw new Error("Bill not found.");
  const amt = num(body.amount) ?? Number(b.total_amount) - Number(b.amount_paid ?? 0);
  if (amt <= 0) throw new Error("Amount sahi likhein.");
  const method = ["cash", "upi", "bank", "other"].includes(str(body.method, 10)) ? str(body.method, 10) : "cash";
  const paid = Number(b.amount_paid ?? 0) + amt;
  const status = paid >= Number(b.total_amount) ? "paid" : "partial";
  await a.from("payments").insert({ owner_id: me, bill_id: id, amount: amt, method, note: str(body.note, 200) || null, verification_status: "verified", verified_at: new Date().toISOString(), verified_by: me });
  await a.from("bills").update({ amount_paid: paid, status, paid_at: status === "paid" ? new Date().toISOString() : null }).eq("id", id);
  return { ok: true, status };
}

export async function listPendingPayments(me: string) {
  const a = await admin();
  const { data: pays } = await a.from("payments").select("id, amount, upi_ref, screenshot_path, created_at, note, bill_id, tenant_user_id").eq("owner_id", me).in("verification_status", ["submitted", "pending"]).order("created_at", { ascending: false }).limit(50);
  const billIds = [...new Set((pays ?? []).map((p: any) => p.bill_id).filter(Boolean))];
  const { data: bills } = billIds.length ? await a.from("bills").select("id, total_amount, amount_paid, rent_period_start, tenants(name, phone), rooms(room_number)").in("id", billIds) : { data: [] as any[] };
  const bm = new Map((bills ?? []).map((b: any) => [b.id, b]));
  const out = [];
  for (const p of pays ?? []) {
    let shot: string | null = null;
    if (p.screenshot_path) {
      const { data: s } = await a.storage.from("payment-proofs").createSignedUrl(p.screenshot_path, 600);
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
  const { data: p } = await a.from("payments").select("id, owner_id, bill_id, amount, verification_status").eq("id", id).maybeSingle();
  if (!p || p.owner_id !== me) throw new Error("Forbidden");
  if (p.verification_status === "verified") throw new Error("Ye pehle hi verify ho chuka hai.");
  const now = new Date().toISOString();
  if (body.decision !== "verify") {
    await a.from("payments").update({ verification_status: "rejected", verified_at: now, verified_by: me }).eq("id", id);
    return { ok: true };
  }
  const { data: bill } = await a.from("bills").select("id, total_amount, amount_paid").eq("id", p.bill_id).single();
  if (!bill) throw new Error("Bill missing");
  const paid = Number(bill.amount_paid ?? 0) + Number(p.amount);
  const status = paid >= Number(bill.total_amount) ? "paid" : "partial";
  await a.from("bills").update({ amount_paid: paid, status, paid_at: status === "paid" ? now : null }).eq("id", bill.id);
  await a.from("payments").update({ verification_status: "verified", verified_at: now, verified_by: me }).eq("id", id);
  return { ok: true, status };
}

// ---------------------------------------------------------------- meters

export async function listMeters(me: string) {
  const a = await admin();
  const { data } = await a.from("meter_submissions").select("id, reading, note, photo_path, created_at, tenants(name), rooms(room_number, id)").eq("owner_id", me).eq("status", "pending").order("created_at").limit(50);
  const out = [];
  for (const s of data ?? []) {
    let photo: string | null = null;
    if (s.photo_path) photo = (await a.storage.from("meter-photos").createSignedUrl(s.photo_path, 600)).data?.signedUrl ?? null;
    const { data: last } = await a.from("meter_readings").select("reading").eq("room_id", s.rooms?.id).order("reading_date", { ascending: false }).limit(1).maybeSingle();
    out.push({ id: s.id, reading: Number(s.reading), note: s.note, createdAt: s.created_at, tenant: s.tenants?.name ?? "Tenant", room: s.rooms?.room_number ?? "", last: last ? Number(last.reading) : null, photo });
  }
  return { submissions: out };
}

export async function decideMeter(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const { data: res, error } = await a.rpc("decide_meter_submission", {
    _owner: me, _id: uuid(body.id), _approve: body.approve === true, _reading: num(body.reading), _note: str(body.note, 300) || null,
  });
  if (error) throw new Error(cleanDb(error.message));
  try {
    const { data: s } = await a.from("meter_submissions").select("submitted_by, approved_reading").eq("id", uuid(body.id)).maybeSingle();
    if (s?.submitted_by)
      await a.from("myr_notifications").insert({
        user_id: s.submitted_by, kind: "meter_decided", title: body.approve === true ? "Meter reading approved" : "Meter reading rejected",
        body: body.approve === true ? `Your owner approved the reading (${Number(s.approved_reading)}). It will be used in your bill.` : "Your owner didn't accept the reading. Please submit it again.", link: "/meter",
      });
  } catch { /* best-effort */ }
  return res as { status: string };
}

/** Landlord enters a reading directly (same table the web "Add reading" writes to). */
export async function addMeterReading(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const room_id = uuid(body.room_id);
  const { data: r } = await a.from("rooms").select("id").eq("id", room_id).eq("owner_id", me).maybeSingle();
  if (!r) throw new Error("Room not found.");
  const reading = num(body.reading);
  if (reading == null || reading < 0) throw new Error("Reading sahi likhein.");
  const { data: last } = await a.from("meter_readings").select("reading").eq("room_id", room_id).order("reading_date", { ascending: false }).limit(1).maybeSingle();
  if (last && reading < Number(last.reading)) throw new Error(`Reading pichli reading (${last.reading}) se kam nahi ho sakti.`);
  const { error } = await a.from("meter_readings").insert({ owner_id: me, room_id, reading, reading_date: iso(body.date) ?? d2(new Date()) });
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}

// ---------------------------------------------------------------- complaints

export async function landlordTickets(me: string) {
  const a = await admin();
  const { data } = await a.from("maintenance_tickets").select("id, title, description, status, priority, created_at, photo_paths, resolution_notes, tenants(name), rooms(room_number)").eq("owner_id", me).order("created_at", { ascending: false }).limit(100);
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
  if (!["open", "in_progress", "resolved", "closed"].includes(status)) throw new Error("Invalid status.");
  const { data: t } = await a.from("maintenance_tickets").select("id").eq("id", id).eq("owner_id", me).maybeSingle();
  if (!t) throw new Error("Ticket not found.");
  const patch: Record<string, unknown> = { status };
  if (str(body.note, 2000)) patch.resolution_notes = str(body.note, 2000);
  if (status === "resolved" || status === "closed") patch.resolved_at = new Date().toISOString();
  const { error } = await a.from("maintenance_tickets").update(patch).eq("id", id);
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}
