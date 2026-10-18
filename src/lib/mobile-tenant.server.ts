/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
/**
 * Tenant features of the mobile app (/api/app/*): booking with terms, bills + UPI payment proof,
 * maintenance tickets with photos. Same ownership/terms rules as the web server functions.
 */
import { missingAcks, REQUIRED_ACKS, ACK_LABELS, TermsSchema, completeness, termsToSpeech } from "./terms/schema";

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
    speech: terms ? termsToSpeech(terms, { rent: Number(r.rent_amount ?? 0), deposit: r.myr_deposit != null ? Number(r.myr_deposit) : null }) : null,
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

  const { error: accErr } = await a.rpc("record_terms_acceptance", { _user: me, _booking: ins.id, _acks: acks, _listened: body.listened === true });
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

/** Latest verified, unexpired live video of a public room (signed URL, same rule as the web player). */
export async function roomVideo(roomId: string) {
  const a = await admin();
  const { data: room } = await a.from("rooms").select("id, is_public, myr_available").eq("id", roomId).maybeSingle();
  if (!room || !room.is_public) return { url: null as string | null };
  const { data: row } = await a
    .from("live_feed_videos")
    .select("storage_path, expires_at")
    .eq("room_id", roomId).eq("verification_status", "verified")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!row) return { url: null as string | null };
  const { data: sig } = await a.storage.from("live-feed-videos").createSignedUrl(row.storage_path, 21600);
  return { url: (sig?.signedUrl as string | undefined) ?? null };
}

/** Documents: terms the tenant accepted (immutable snapshots) and verified payment receipts. */
export async function myDocuments(me: string) {
  const a = await admin();
  const [{ data: acc }, { data: pays }] = await Promise.all([
    a.from("booking_terms_acceptances")
      .select("id, booking_id, terms_version, accepted_at, snapshot_hash, snapshot, property_id, room_id, rooms(room_number, rent_amount, myr_deposit), properties(name)")
      .eq("tenant_user_id", me).order("accepted_at", { ascending: false }).limit(30),
    a.from("payments")
      .select("id, amount, upi_ref, verified_at, created_at, bills(rent_period_start, rent_period_end, rooms(room_number, properties(name)))")
      .eq("tenant_user_id", me).eq("verification_status", "verified").order("verified_at", { ascending: false }).limit(60),
  ]);
  return { terms: acc ?? [], receipts: pays ?? [] };
}

export async function markNotifRead(me: string, id: string | null) {
  const a = await admin();
  let q = a.from("myr_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me).is("read_at", null);
  if (id) q = q.eq("id", id);
  await q;
  return { ok: true };
}

// ---------- identity documents (admin verifies → "verified tenant") ----------
const DOC_TYPES = ["aadhaar", "pan", "driving_license", "voter_id", "passport", "college_id", "photo"] as const;

export async function kycList(me: string) {
  const a = await admin();
  const [{ data: docs }, { data: v }] = await Promise.all([
    a.from("tenant_documents").select("id, doc_type, status, admin_note, created_at, reviewed_at").eq("user_id", me).order("created_at", { ascending: false }),
    a.rpc("tenant_verified", { _uid: me }),
  ]);
  return { verified: v === true, docs: docs ?? [] };
}

export async function kycUpload(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const type = str(body.doc_type, 30);
  if (!(DOC_TYPES as readonly string[]).includes(type)) throw new Error("Choose a document type.");
  const b64 = typeof body.image_base64 === "string" ? body.image_base64 : "";
  if (!b64) throw new Error("Choose a photo of the document.");
  if (b64.length > 8_000_000) throw new Error("Photo is too large. Try a smaller one.");
  const mime = /^image\/(jpeg|png|webp)$/.test(str(body.mime, 30)) ? str(body.mime, 30) : "image/jpeg";
  const { data: existing } = await a.from("tenant_documents").select("id, status, storage_path").eq("user_id", me).eq("doc_type", type);
  if ((existing ?? []).some((d: any) => d.status === "verified")) throw new Error("This document is already verified.");
  const { count } = await a.from("tenant_documents").select("id", { count: "exact", head: true }).eq("user_id", me).eq("status", "pending");
  const pendingSame = (existing ?? []).filter((d: any) => d.status === "pending");
  if ((count ?? 0) - pendingSame.length >= 6) throw new Error("Too many documents waiting for review.");
  const path = `${me}/${type}-${Date.now()}.${mime.split("/")[1]}`;
  const { error: upErr } = await a.storage.from("tenant-docs").upload(path, Buffer.from(b64, "base64"), { contentType: mime, upsert: false });
  if (upErr) throw new Error("Couldn't upload. Please try again.");
  // A new upload replaces an older pending/rejected one of the same type.
  for (const d of (existing ?? []) as any[]) {
    await a.from("tenant_documents").delete().eq("id", d.id);
    await a.storage.from("tenant-docs").remove([d.storage_path]);
  }
  const { error } = await a.from("tenant_documents").insert({ user_id: me, doc_type: type, storage_path: path });
  if (error) throw new Error("Couldn't save. Please try again.");
  return { ok: true };
}

// ---------- meter readings (tenant submits, landlord approves) ----------
export async function meterOverview(me: string) {
  const a = await admin();
  const ids = await myTenantIds(a, me);
  if (!ids.length) return { rooms: [], submissions: [] };
  const { data: tenants } = await a.from("tenants").select("id, room_id, rooms(room_number, properties(name))").in("id", ids);
  const rooms = [];
  for (const t of (tenants ?? []) as any[]) {
    const { data: last } = await a.from("meter_readings").select("reading, reading_date").eq("room_id", t.room_id)
      .order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
    rooms.push({ tenant_id: t.id, room: t.rooms?.room_number, property: t.rooms?.properties?.name, last: last ? { reading: Number(last.reading), date: last.reading_date } : null });
  }
  const { data: subs } = await a.from("meter_submissions")
    .select("id, tenant_id, reading, approved_reading, status, landlord_note, created_at, decided_at")
    .in("tenant_id", ids).order("created_at", { ascending: false }).limit(30);
  return { rooms, submissions: subs ?? [] };
}

export async function meterSubmit(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const t = await assertTenant(a, me, uuid(body.tenant_id));
  const reading = Number(body.reading);
  if (!Number.isFinite(reading) || reading < 0 || reading > 99_999_999) throw new Error("Enter the meter reading as a number.");
  const { data: last } = await a.from("meter_readings").select("reading").eq("room_id", t.room_id)
    .order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (last && reading < Number(last.reading)) throw new Error(`Reading can't be lower than the last one (${Number(last.reading)}).`);
  const { data: pending } = await a.from("meter_submissions").select("id").eq("tenant_id", t.id).eq("room_id", t.room_id).eq("status", "pending").maybeSingle();
  if (pending) throw new Error("Your previous reading is still waiting for the owner's approval.");
  let photo_path: string | null = null;
  const b64 = typeof body.photo_base64 === "string" ? body.photo_base64 : "";
  if (b64) {
    if (b64.length > 8_000_000) throw new Error("Photo is too large.");
    const path = `${t.owner_id}/${t.room_id}/tenant-${Date.now()}.jpg`;
    const { error } = await a.storage.from("meter-photos").upload(path, Buffer.from(b64, "base64"), { contentType: "image/jpeg", upsert: false });
    if (!error) photo_path = path;
  }
  if (!photo_path) throw new Error("Meter ki photo zaroori hai taaki owner number check kar sake.");
  const { error } = await a.from("meter_submissions").insert({
    tenant_id: t.id, room_id: t.room_id, owner_id: t.owner_id, submitted_by: me, reading, photo_path, note: str(body.note, 300) || null,
  });
  if (error) throw new Error("Couldn't submit. Please try again.");
  try {
    await a.from("myr_notifications").insert({
      user_id: t.owner_id, kind: "meter_submitted", title: "Meter reading to approve",
      body: `${t.name} submitted a meter reading (${reading}). Approve it so it's used in the bill.`, link: "/meters",
    });
  } catch { /* best-effort */ }
  return { ok: true };
}

export async function setMyName(me: string, name: string) {
  const a = await admin();
  const n = name.trim().slice(0, 80);
  if (n.length < 2) throw new Error("Enter your name.");
  await a.from("profiles").update({ full_name: n }).eq("id", me);
  return { ok: true };
}

// ---------- my stay: tenancy details, landlord contact, deposit, usage, notice ----------
export async function myStay(me: string) {
  const a = await admin();
  const ids = await myTenantIds(a, me);
  if (!ids.length) return { stays: [] };
  const { data: tenants } = await a
    .from("tenants")
    .select("id, name, move_in_date, rent_share, persons, owner_id, room_id, rooms(room_number, rent_amount, properties(name, address, myr_address, city, myr_city))")
    .in("id", ids);
  const stays = [];
  for (const t of (tenants ?? []) as any[]) {
    const [{ data: landlord }, { data: dep }, { data: reads }, { data: notice }] = await Promise.all([
      a.from("profiles").select("full_name, business_name, mobile, phone").eq("id", t.owner_id).maybeSingle(),
      a.from("deposits").select("amount_held, amount_deducted, amount_refunded, status, deduction_reason").eq("tenant_id", t.id).maybeSingle(),
      a.from("meter_readings").select("reading, reading_date").eq("room_id", t.room_id).order("reading_date", { ascending: false }).order("created_at", { ascending: false }).limit(7),
      a.from("activity_log").select("created_at, metadata").eq("user_id", me).eq("action", "notice_requested").eq("target_id", t.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    const list = ((reads ?? []) as Array<{ reading: number; reading_date: string }>).map((r) => ({ reading: Number(r.reading), date: r.reading_date })).reverse();
    const usage = list.slice(1).map((r, i) => ({ date: r.date, units: Math.max(0, r.reading - list[i].reading) }));
    stays.push({
      tenant_id: t.id as string,
      name: t.name as string,
      move_in_date: t.move_in_date as string,
      rent_share: t.rent_share != null ? Number(t.rent_share) : null,
      persons: t.persons as number,
      room: t.rooms?.room_number as string,
      rent: Number(t.rooms?.rent_amount ?? 0),
      property: t.rooms?.properties?.name as string,
      address: (t.rooms?.properties?.myr_address || t.rooms?.properties?.address || "") as string,
      city: (t.rooms?.properties?.myr_city || t.rooms?.properties?.city || "") as string,
      landlord: { name: landlord?.business_name || landlord?.full_name || "Owner", mobile: landlord?.mobile || landlord?.phone || null },
      deposit: dep ? { held: Number(dep.amount_held), deducted: Number(dep.amount_deducted), refunded: Number(dep.amount_refunded), status: dep.status as string, reason: dep.deduction_reason as string | null } : null,
      usage,
      notice: notice ? { at: notice.created_at as string, moveOut: (notice.metadata as any)?.move_out_date as string | null } : null,
    });
  }
  return { stays };
}

export async function requestNotice(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const t = await assertTenant(a, me, uuid(body.tenant_id));
  const moveOut = str(body.move_out_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveOut) || Number.isNaN(Date.parse(moveOut))) throw new Error("Enter the move-out date as YYYY-MM-DD.");
  if (Date.parse(moveOut) < Date.now() - 86_400_000) throw new Error("Move-out date can't be in the past.");
  const { data: recent } = await a.from("activity_log").select("id").eq("user_id", me).eq("action", "notice_requested").eq("target_id", t.id)
    .gt("created_at", new Date(Date.now() - 7 * 86_400_000).toISOString()).limit(1);
  if (recent?.length) throw new Error("You already sent a notice this week.");
  const reason = str(body.reason, 300);
  await a.from("activity_log").insert({ user_id: me, action: "notice_requested", target_type: "tenant", target_id: t.id, metadata: { move_out_date: moveOut, reason } });
  await a.from("myr_notifications").insert({
    user_id: t.owner_id, kind: "notice_requested", title: "Tenant gave notice",
    body: `${t.name} plans to move out on ${moveOut}.${reason ? ` Reason: ${reason}` : ""}`, link: "/tenants",
  });
  return { ok: true };
}

export async function deleteAccount(me: string, confirm: string) {
  if (confirm !== "DELETE") throw new Error('Type DELETE to confirm.');
  const a = await admin();
  const { error } = await a.auth.admin.deleteUser(me);
  if (error) throw new Error("Couldn't delete the account. Please try again.");
  return { ok: true };
}

// ---------- notification settings ----------
const PREF_KEYS = ["push_enabled", "rent", "bookings", "maintenance", "roommate", "account"] as const;
export async function getPrefs(me: string) {
  const a = await admin();
  const { data } = await a.from("notification_prefs").select("*").eq("user_id", me).maybeSingle();
  const { DEFAULT_PREFS } = await import("./push");
  return { prefs: { ...DEFAULT_PREFS, ...(data ?? {}) } };
}
export async function savePrefs(me: string, body: Record<string, unknown>) {
  const a = await admin();
  const row: Record<string, unknown> = { user_id: me, updated_at: new Date().toISOString() };
  for (const k of PREF_KEYS) if (typeof body[k] === "boolean") row[k] = body[k];
  const hr = (v: unknown) => (v === null ? null : Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 23 ? (v as number) : undefined);
  if ("quiet_start" in body || "quiet_end" in body) {
    const qs = hr(body.quiet_start), qe = hr(body.quiet_end);
    if (qs === undefined || qe === undefined) throw new Error("Invalid quiet hours.");
    row.quiet_start = qs; row.quiet_end = qe;
  }
  if (Number.isInteger(body.tz_offset_min) && Math.abs(body.tz_offset_min as number) <= 840) row.tz_offset_min = body.tz_offset_min;
  const { error } = await a.from("notification_prefs").upsert(row, { onConflict: "user_id" });
  if (error) throw new Error("Couldn't save settings. Please try again.");
  return getPrefs(me);
}
