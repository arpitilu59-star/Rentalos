/* eslint-disable @typescript-eslint/no-explicit-any -- loosely typed service-role client */
/**
 * Tenant rent offers — thin server layer over the SECURITY DEFINER functions in
 * supabase/migrations/20261115000000_tenant_offers.sql (the database owns the rules and the state machine).
 *
 * Privacy rule: the landlord's floor (room_offer_settings.min_rent) is NEVER returned by anything the tenant
 * side can call. Only getOwnerOfferSettings() returns it, and only to the owner of the room.
 */

export const MIN_OFFER_RATIO = 0.5;

/** Friendly message for the database's OFFER_* / COUNTER_* error codes. Unknown errors become a generic line. */
export function offerError(e: unknown): Error {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as any).message)
        : String(e ?? "");
  const code =
    /(OFFER_RESERVED|OFFER_CONFIRM_REQUIRED|OFFER_VERIFICATION_REQUIRED|OFFER_COOLDOWN|OFFER_TERMS_REVIEW|OFFER_MOVE_IN_INVALID|OFFER_ROOM_FULL|OFFERS_OFF|OFFER_NOT_LOWER|OFFER_TOO_LOW|OFFER_LIMIT|OFFER_INVALID_STATE|OFFER_INVALID_ACTION|OFFER_INVALID|OFFER_OPEN|OFFER_EXPIRED|COUNTER_INVALID|COUNTER_LIMIT|FORBIDDEN)/.exec(
      raw,
    )?.[1];
  const map: Record<string, string> = {
    OFFER_RESERVED: "Is room par doosra offer confirmation ka intezaar kar raha hai.",
    OFFER_CONFIRM_REQUIRED: "Tenant ko pehle 24 ghante ke andar booking confirm karni hai.",
    OFFER_VERIFICATION_REQUIRED: "Offer bhejne se pehle apni tenant verification complete karein.",
    OFFER_COOLDOWN: "Agla offer bhejne se pehle 15 minute rukhein.",
    OFFER_TERMS_REVIEW: "Booking confirm karne se pehle updated rental terms accept karein.",
    OFFER_MOVE_IN_INVALID: "Move-in date aaj se agle 365 din ke beech honi chahiye.",
    OFFER_ROOM_FULL: "Room full hai. Kisi aur available room ko chunein.",
    OFFERS_OFF: "Ye room abhi offers nahi le raha.",
    OFFER_NOT_LOWER:
      "Offer listed rent se kam hona chahiye. Poore rent par seedha request bhejein.",
    OFFER_TOO_LOW: "Itna kam offer accept nahi hota. Rent ke kam se kam 50% ka offer dein.",
    OFFER_LIMIT: "Is room par maximum 2 offers aur ek din mein total 10 offers bhej sakte hain.",
    OFFER_INVALID_STATE:
      "Ye offer ab decide ya update nahi ho sakta (shayad pehle hi decide ho chuka hai).",
    OFFER_INVALID_ACTION: "Galat action.",
    OFFER_INVALID: "Offer amount sahi nahi hai.",
    OFFER_OPEN:
      "Pehle rent offer par decision lein (approve, deny ya counter), phir request accept karein.",
    OFFER_EXPIRED: "Ye offer expire ho chuka hai.",
    COUNTER_INVALID: "Counter amount offer se zyada aur listed rent se zyada nahi hona chahiye.",
    COUNTER_LIMIT: "Sirf ek counter offer allowed hai.",
    FORBIDDEN: "Aapko ye karne ki permission nahi hai.",
  };
  return new Error(code ? map[code] : "Offer process nahi ho paya. Dobara try karein.");
}

/** A positive whole-rupee amount, or null if absent/invalid. */
export function parseAmount(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[, ₹]/g, ""));
  if (!Number.isFinite(n) || n <= 0 || n > 10_000_000) return null;
  return Math.round(n);
}

export async function expireOffers(a: any): Promise<void> {
  try {
    await a.rpc("expire_booking_offers");
  } catch {
    /* cron also does this; never block a read on it */
  }
}

/** Attach an offer to a just-created booking. Caller deletes the booking if this throws (same as the terms rule). */
export async function submitOffer(a: any, bookingId: string, tenantId: string, amount: number) {
  const { data, error } = await a.rpc("offer_submit", {
    _booking: bookingId,
    _tenant: tenantId,
    _offered: amount,
  });
  if (error) throw offerError(error);
  return data as { offer_status: "pending" | "approved" };
}

export async function decideOffer(
  a: any,
  landlordId: string,
  bookingId: string,
  action: unknown,
  counter?: unknown,
) {
  if (action !== "approve" && action !== "deny" && action !== "counter")
    throw offerError("OFFER_INVALID_ACTION");
  const { data, error } = await a.rpc("offer_decide", {
    _booking: bookingId,
    _landlord: landlordId,
    _action: action,
    _counter: action === "counter" ? parseAmount(counter) : null,
  });
  if (error) throw offerError(error);
  return data as { offer_status: string; agreed_rent?: number; counter_rent?: number };
}

export async function respondOffer(a: any, tenantId: string, bookingId: string, action: unknown) {
  if (action !== "accept" && action !== "decline") throw offerError("OFFER_INVALID_ACTION");
  const { data, error } = await a.rpc("offer_respond", {
    _booking: bookingId,
    _tenant: tenantId,
    _action: action,
  });
  if (error) throw offerError(error);
  if ((data as any)?.offer_status === "expired") throw offerError("OFFER_EXPIRED");
  return data as { offer_status: string; agreed_rent?: number };
}

/**
 * Rent to store on the tenant when a request is accepted: the agreed rent if an offer was approved,
 * otherwise `fallback` (the listed rent or the landlord's manual value). Throws if an offer is still open.
 * An agreed rent always wins — the landlord's manual override can't contradict what the tenant agreed to.
 */
export async function rentForAccept(
  a: any,
  bookingId: string,
  fallback: number | null,
): Promise<number | null> {
  const { data, error } = await a.rpc("offer_agreed_rent", { _booking: bookingId });
  if (error) throw offerError(error);
  return data != null ? Number(data) : fallback;
}

/** Tenant-safe: is this room taking offers, and what is the (public) minimum allowed. Never the floor. */
export async function getRoomOfferInfo(a: any, roomId: string) {
  const [{ data: s }, { data: r }] = await Promise.all([
    a.from("room_offer_settings").select("offers_enabled").eq("room_id", roomId).maybeSingle(),
    a.from("rooms").select("rent_amount").eq("id", roomId).maybeSingle(),
  ]);
  const rent = Number(r?.rent_amount ?? 0);
  const enabled = !!s?.offers_enabled && rent > 0;
  return { enabled, rent, min_allowed: enabled ? Math.ceil(rent * MIN_OFFER_RATIO) : null };
}

/** Owner-only: includes the floor. */
export async function getOwnerOfferSettings(a: any, ownerId: string, roomId: string) {
  const { data: room } = await a
    .from("rooms")
    .select("id, owner_id, rent_amount")
    .eq("id", roomId)
    .maybeSingle();
  if (!room || room.owner_id !== ownerId) throw offerError("FORBIDDEN");
  const { data: s } = await a
    .from("room_offer_settings")
    .select("offers_enabled, min_rent, auto_approve")
    .eq("room_id", roomId)
    .maybeSingle();
  return {
    room_id: roomId,
    rent: Number(room.rent_amount ?? 0),
    offers_enabled: !!s?.offers_enabled,
    min_rent: s?.min_rent != null ? Number(s.min_rent) : null,
    auto_approve: !!s?.auto_approve,
  };
}

export async function saveOwnerOfferSettings(
  a: any,
  ownerId: string,
  input: { room_id: string; offers_enabled: boolean; min_rent: unknown; auto_approve: boolean },
) {
  const cur = await getOwnerOfferSettings(a, ownerId, input.room_id); // also checks ownership
  const min =
    input.min_rent === null || input.min_rent === "" || input.min_rent === undefined
      ? null
      : parseAmount(input.min_rent);
  if (
    input.min_rent !== null &&
    input.min_rent !== "" &&
    input.min_rent !== undefined &&
    min === null
  )
    throw new Error("Minimum rent sahi number hona chahiye.");
  if (min != null && cur.rent > 0 && min > cur.rent)
    throw new Error("Minimum rent listed rent se zyada nahi ho sakta.");
  if (input.offers_enabled && min == null)
    throw new Error("Offers on karne ke liye apna minimum (floor) rent set karein.");
  if (input.auto_approve && min == null)
    throw new Error("Auto-approve ke liye minimum rent zaroori hai.");
  const { error } = await a.from("room_offer_settings").upsert(
    {
      room_id: input.room_id,
      owner_id: ownerId,
      offers_enabled: input.offers_enabled,
      min_rent: min,
      auto_approve: input.offers_enabled ? input.auto_approve : false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "room_id" },
  );
  if (error) throw new Error("Settings save nahi ho payi. Dobara try karein.");
  return { ok: true };
}

/** What the TENANT may see about an offer on their own booking. Never the floor. */
export function tenantOfferView(b: any) {
  if (!b || !b.offer_status) return null;
  return {
    status: b.offer_status as string,
    offered_rent: b.offered_rent != null ? Number(b.offered_rent) : null,
    counter_rent: b.counter_rent != null ? Number(b.counter_rent) : null,
    agreed_rent: b.agreed_rent != null ? Number(b.agreed_rent) : null,
    expires_at: b.offer_expires_at ?? null,
    confirmed_at: b.offer_confirmed_at ?? null,
  };
}

export const OFFER_COLUMNS =
  "offer_status, offered_rent, counter_rent, agreed_rent, offer_expires_at, offer_confirmed_at, offer_rounds";

export async function confirmOffer(a: any, tenantId: string, bookingId: string, moveIn: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(moveIn)) throw offerError("OFFER_MOVE_IN_INVALID");
  const { data, error } = await a.rpc("confirm_room_offer", {
    _booking: bookingId,
    _tenant: tenantId,
    _move_in: moveIn,
  });
  if (error) throw offerError(error);
  return data as { ok: true; tenant_id: string };
}
export async function acceptBookingAtomically(
  a: any,
  ownerId: string,
  bookingId: string,
  moveIn: string,
  rent: number | null,
) {
  const { data, error } = await a.rpc("accept_room_booking", {
    _booking: bookingId,
    _landlord: ownerId,
    _move_in: moveIn,
    _rent: rent,
  });
  if (error) throw offerError(error);
  return data as { ok: true; tenant_id: string };
}

/** Request, terms snapshot and offer commit together; the database serializes capacity and rate checks. */
export async function createOfferBooking(
  a: any,
  tenantId: string,
  input: {
    room_id: string;
    tenant_name: string;
    tenant_mobile: string;
    tenant_email?: string | null;
    message?: string | null;
    acknowledgements?: Record<string, boolean>;
    listened?: boolean;
    offered_rent: number;
  },
) {
  const { data, error } = await a.rpc("create_room_offer_booking", {
    _tenant: tenantId,
    _room: input.room_id,
    _name: input.tenant_name,
    _mobile: input.tenant_mobile,
    _email: input.tenant_email ?? null,
    _message: input.message ?? null,
    _acks: input.acknowledgements ?? {},
    _listened: input.listened ?? false,
    _offered: input.offered_rent,
  });
  if (error) throw offerError(error);
  return data as { booking_id: string; offer: "sent" };
}
