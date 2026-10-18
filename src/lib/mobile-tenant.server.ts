/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
/**
 * Tenant features of the mobile app (/api/app/*): booking with terms, bills + UPI payment proof,
 * maintenance tickets with photos. Same ownership/terms rules as the web server functions.
 */
import { missingAcks, REQUIRED_ACKS, ACK_LABELS, TermsSchema, completeness } from "./terms/schema";

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string => {
  const s = str(v, 40);
  if (!UUID.test(s)) throw new Error("Invalid id.");
  return s;
};
const cleanDb = (m: string) => m.replace(/^.*?ERROR:\s*/, "").slice(0, 200);

async function admin() {
  const { getAdmin } = await import("./whatsapp/db");
  return (await getAdmin()) as any;
}

/** Tenancies the user may act on: linked by user id, mobile or email (same as the web portal). */
export async function myTenantIds(a: any, me: string): Promise<string[]> {
  const { data: u } = await a.auth.admin.getUserById(me);
  const email = u?.user?.email?.toLowerCase() ?? null;
  const { data: prof } = await a.from("profiles").select("mobile").eq("id", me).maybeSingle();
  const filters = [`tenant_user_id.eq.${me}`];
  if (prof?.mobile) filters.push(`phone.eq.${prof.mobile}`);
  if (email) filters.push(`email.ilike.${email}`);
  const { data } = await a.from("tenants").select("id").or(filters.join(",")).eq("active", true);
  return (data ?? []).map((t: { id: string }) => t.id);
}

async function assertTenant(a: any, me: string, tenantId: string) {
  const ids = await myTenantIds(a, me);
  if (!ids.includes(tenantId)) throw new Error("Forbidden");
  const { data } = await a.from("tenants").select("id, owner_id, room_id, name").eq("id", tenantId).maybeSingle();
  if (!data) throw new Error("Forbidden");
  return data as { id: string; owner_id: string; room_id: string; name: string };
}

/** Terms a tenant must read + tick before requesting a room. */
export async function roomTerms(roomId: string) {
  const a = await admin();
  const { data: r } = await a
    .from("rooms")
    .select("id, rent_amount, myr_deposit, is_public, myr_available, properties(name, is_public_listing, terms_summary, current_terms_version)")
    .eq("id", roomId)
    .maybeSingle();
  if (!r || !r.is_public || !r.myr_available) throw new Error("Room not available");
  let terms = null;
  if (r.properties?.terms_summary) {
    const p = TermsSchema.safeParse(r.properties.terms_summary);
    if (p.success) terms = p.data;
  }
  return {
    terms,
    version: (r.properties?.current_terms_version as number | null) ?? null,
    completeness: terms ? completeness(terms) : 0,
    rent: Number(r.rent_amount ?? 0),
    deposit: r.myr_deposit != null ? Number(r.myr_deposit) : null,
    acks: REQUIRED_ACKS.map((k) => ({ key: k, label: ACK_LABELS[k] })),
  };
}

export async function createBookingFromApp(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const roomId = uuid(body.room_id);
  const name = str(body.tenant_name, 120);
  const mobile = str(body.tenant_mobile, 20).replace(/[^\d+]/g, "");
  const email = str(body.tenant_email, 200) || null;
  if (name.length < 2) throw new Error("Please enter your name.");
  if (mobile.replace(/\D/g, "").length < 10) throw new Error("Please enter a valid mobile number.");
  const acks = (typeof body.acknowledgements === "object" && body.acknowledgements ? body.acknowledgements : {}) as Record<string, boolean>;

  const { data: r } = await a.from("rooms").select("id, property_id, owner_id, is_public, myr_available, capacity").eq("id", roomId).maybeSingle();
  if (!r || !r.is_public || !r.myr_available) throw new Error("Room not available");
  const [{ count: active }, { data: mine }] = await Promise.all([
    a.from("tenants").select("id", { count: "exact", head: true }).eq("room_id", r.id).eq("active", true),
    a.from("bookings").select("id, room_id").eq("tenant_user_id", me).eq("status", "pending"),
  ]);
  if ((active ?? 0) >= (r.capacity ?? 1)) throw new Error("Room not available");
  if ((mine ?? []).some((b: { room_id: string }) => b.room_id === r.id)) throw new Error("You already have a pending request for this room.");
  if ((mine ?? []).length >= 10) throw new Error("You have too many pending requests. Wait for owners to respond first.");

  const { data: prop } = await a.from("properties").select("current_terms_version").eq("id", r.property_id).maybeSingle();
  if (prop?.current_terms_version != null && missingAcks(acks).length)
    throw new Error("TERMS_REQUIRED: please read and tick every acknowledgement before sending the request.");

  await a.from("profiles").update({ mobile, primary_role: "tenant" }).eq("id", me);
  const { data: ins, error } = await a
    .from("bookings")
    .insert({
      room_id: r.id, property_id: r.property_id, landlord_id: r.owner_id, tenant_user_id: me,
      tenant_name: name, tenant_mobile: mobile, tenant_email: email, message: str(body.message, 1000) || null, status: "pending",
    })
    .select("id")
    .single();
  if (error) throw new Error(cleanDb(error.message));

  const { error: accErr } = await a.rpc("record_terms_acceptance", { _user: me, _booking: ins.id, _acks: acks, _listened: false });
  if (accErr) {
    await a.from("bookings").delete().eq("id", ins.id); // never a request without its terms record
    throw new Error(cleanDb(accErr.message) || "Couldn't record the terms. Please try again.");
  }
  try {
    const { data: admins } = await a.from("admin_users").select("user_id").eq("active", true);
    if (admins?.length)
      await a.from("myr_notifications").insert(
        admins.map((x: { user_id: string }) => ({
          user_id: x.user_id, kind: "admin_new_booking", title: "New booking request",
          body: `${name} (${mobile}) requested a room. Verify it in Admin → Bookings.`, link: "/admin/bookings",
        })),
      );
  } catch { /* best-effort */ }
  return { booking_id: ins.id as string };
}

export async function myBookings(me: string) {
  const a = await admin();
  const { data } = await a
    .from("bookings")
    .select("id, status, created_at, rooms(room_number, rent_amount, properties(name, myr_city, city))")
    .eq("tenant_user_id", me)
    .order("created_at", { ascending: false })
    .limit(50);
  return { bookings: data ?? [] };
}

export async function cancelBooking(me: string, id: string) {
  const a = await admin();
  const { data: b } = await a.from("bookings").select("id, status, tenant_user_id").eq("id", id).maybeSingle();
  if (!b || b.tenant_user_id !== me) throw new Error("Forbidden");
  if (b.status !== "pending") throw new Error("Only a pending request can be cancelled.");
  const { error } = await a.from("bookings").update({ status: "cancelled" }).eq("id", id);
  if (error) throw new Error("Couldn't cancel. Please try again.");
  return { ok: true };
}

export async function myBills(me: string) {
  const a = await admin();
  const ids = await myTenantIds(a, me);
  if (!ids.length) return { bills: [], tenancies: [], outstanding: 0 };
  const [{ data: bills }, { data: tenancies }] = await Promise.all([
    a.from("bills")
      .select("id, tenant_id, total_amount, amount_paid, status, due_date, rent_period_start, rent_period_end, rent_amount, electricity_amount, water_amount, other_charges, other_charges_note, previous_dues, units_consumed, paid_at, rooms(room_number)")
      .in("tenant_id", ids).order("rent_period_start", { ascending: false }).limit(60),
    a.from("tenants").select("id, name, rooms(room_number, properties(name))").in("id", ids),
  ]);
  const outstanding = (bills ?? []).reduce((s: number, b: any) => s + Math.max(0, (b.total_amount ?? 0) - (b.amount_paid ?? 0)), 0);
  return { bills: bills ?? [], tenancies: tenancies ?? [], outstanding };
}

export async function payInfo(me: string, billId: string) {
  const a = await admin();
  const { data: bill } = await a
    .from("bills")
    .select("id, total_amount, amount_paid, status, due_date, rent_period_start, owner_id, tenant_id, rooms(room_number)")
    .eq("id", billId).maybeSingle();
  if (!bill) throw new Error("Bill not found");
  await assertTenant(a, me, bill.tenant_id);
  const [{ data: landlord }, { data: payments }, { data: gate }] = await Promise.all([
    a.from("profiles").select("full_name, business_name, upi_id").eq("id", bill.owner_id).maybeSingle(),
    a.from("payments").select("id, amount, upi_ref, verification_status, created_at, note").eq("bill_id", bill.id).order("created_at", { ascending: false }),
    a.rpc("terms_gate_status", { _tenant_id: bill.tenant_id }),
  ]);
  return {
    bill: { ...bill, due: Math.max(0, (bill.total_amount ?? 0) - (bill.amount_paid ?? 0)) },
    payee: { name: landlord?.business_name || landlord?.full_name || "Landlord", upi: landlord?.upi_id ?? null },
    payments: payments ?? [],
    termsRequired: gate === "REQUIRED",
  };
}

export async function submitProof(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const billId = uuid(body.bill_id);
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) throw new Error("Enter a valid amount.");
  const { data: bill } = await a.from("bills").select("id, owner_id, tenant_id").eq("id", billId).maybeSingle();
  if (!bill) throw new Error("Bill not found");
  await assertTenant(a, me, bill.tenant_id);
  const { data: gate } = await a.rpc("terms_gate_status", { _tenant_id: bill.tenant_id });
  if (gate === "REQUIRED") throw new Error("TERMS_REQUIRED: please accept the rental terms for your booking before paying.");

  let screenshot_path: string | null = null;
  const b64 = typeof body.screenshot_base64 === "string" ? body.screenshot_base64 : "";
  if (b64) {
    if (b64.length > 8_000_000) throw new Error("Screenshot is too large.");
    const mime = /^image\/(jpeg|png|webp)$/.test(str(body.screenshot_mime, 30)) ? str(body.screenshot_mime, 30) : "image/jpeg";
    const path = `${me}/${bill.id}/${Date.now()}.${mime.split("/")[1]}`;
    const { error: upErr } = await a.storage.from("payment-proofs").upload(path, Buffer.from(b64, "base64"), { contentType: mime, upsert: false });
    if (upErr) throw new Error("Couldn't upload the screenshot. Please try again.");
    screenshot_path = path;
  }
  const upiRef = str(body.upi_ref, 64) || null;
  if (!upiRef && !screenshot_path) throw new Error("Add the UPI reference number or a payment screenshot.");
  const { data: ins, error } = await a
    .from("payments")
    .insert({ owner_id: bill.owner_id, bill_id: bill.id, tenant_user_id: me, amount, method: "upi", upi_ref: upiRef,
      note: str(body.note, 500) || null, screenshot_path, verification_status: "submitted" })
    .select("id").single();
  if (error) throw new Error(cleanDb(error.message));
  return { payment_id: ins.id as string };
}

export async function listTickets(me: string) {
  const a = await admin();
  const ids = await myTenantIds(a, me);
  if (!ids.length) return { tickets: [], tenancies: [] };
  const [{ data: tickets }, { data: tenancies }] = await Promise.all([
    a.from("maintenance_tickets")
      .select("id, tenant_id, title, description, priority, status, photo_paths, resolution_notes, created_at")
      .in("tenant_id", ids).order("created_at", { ascending: false }).limit(50),
    a.from("tenants").select("id, rooms(room_number, properties(name))").in("id", ids),
  ]);
  const out = [];
  for (const t of (tickets ?? []) as any[]) {
    const photos: string[] = [];
    for (const p of ((t.photo_paths ?? []) as string[]).slice(0, 4)) {
      const { data: s } = await a.storage.from("ticket-photos").createSignedUrl(p, 3600);
      if (s?.signedUrl) photos.push(s.signedUrl);
    }
    out.push({ ...t, photos });
  }
  return { tickets: out, tenancies: tenancies ?? [] };
}

export async function createTicket(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const t = await assertTenant(a, me, uuid(body.tenant_id));
  const title = str(body.title, 120);
  if (title.length < 2) throw new Error("Write what the problem is.");
  const priority = ["low", "medium", "high", "urgent"].includes(str(body.priority, 10)) ? str(body.priority, 10) : "medium";
  const paths: string[] = [];
  const photos = Array.isArray(body.photos_base64) ? (body.photos_base64 as unknown[]).slice(0, 3) : [];
  for (const p of photos) {
    if (typeof p !== "string" || !p || p.length > 8_000_000) continue;
    const path = `${t.id}/${Date.now()}-${paths.length}.jpg`;
    const { error } = await a.storage.from("ticket-photos").upload(path, Buffer.from(p, "base64"), { contentType: "image/jpeg", upsert: false });
    if (!error) paths.push(path);
  }
  const { error } = await a.from("maintenance_tickets").insert({
    owner_id: t.owner_id, tenant_id: t.id, room_id: t.room_id, title,
    description: str(body.description, 2000) || null, priority, status: "open", photo_paths: paths,
  });
  if (error) throw new Error(cleanDb(error.message));
  return { ok: true };
}
