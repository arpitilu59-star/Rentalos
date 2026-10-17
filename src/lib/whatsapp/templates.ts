/**
 * Event -> approved Meta template name. Every template is expected to have
 * exactly TWO body variables: {{1}} = short headline, {{2}} = detail line.
 * Names are overridable via env (META_TEMPLATE_<EVENT>) because the real
 * names depend on what Meta approves for your WABA.
 */
export type WhatsAppEventType =
  | "rent_due_soon"
  | "rent_overdue"
  | "rent_new_bill"
  | "payment_submitted"
  | "payment_verified"
  | "maintenance_update"
  | "booking_update"
  | "lease_expiring"
  | "verification_update"
  | "subscription_update"
  | "generic_update";

const DEFAULTS: Record<WhatsAppEventType, string> = {
  rent_due_soon: "rentalos_rent_due_soon",
  rent_overdue: "rentalos_rent_overdue",
  rent_new_bill: "rentalos_new_bill",
  payment_submitted: "rentalos_payment_submitted",
  payment_verified: "rentalos_payment_verified",
  maintenance_update: "rentalos_maintenance_update",
  booking_update: "rentalos_booking_update",
  lease_expiring: "rentalos_lease_expiring",
  verification_update: "rentalos_verification_update",
  subscription_update: "rentalos_subscription_update",
  generic_update: "rentalos_generic_update",
};

export function templateFor(event: WhatsAppEventType): string {
  return process.env[`META_TEMPLATE_${event.toUpperCase()}`] || DEFAULTS[event];
}

/** Map an in-app notification `kind` to a WhatsApp event. */
export function eventForNotificationKind(rawKind: string): WhatsAppEventType | null {
  // The cron jobs emit UPPERCASE kinds (RENT_DUE, RENT_OVERDUE, LEASE_EXPIRING);
  // normalise so both styles map.
  const kind = (rawKind || "").toLowerCase();
  if (kind === "rent_due") return "rent_due_soon";
  if (kind === "rent_overdue") return "rent_overdue";
  if (kind === "bill_due_soon") return "rent_due_soon";
  if (kind === "bill_landlord_reminder") return "rent_overdue";
  if (kind === "bill_new") return "rent_new_bill";
  if (kind === "payment_submitted") return "payment_submitted";
  if (kind === "payment_verified" || kind === "payment_approved") return "payment_verified";
  if (kind.startsWith("maintenance")) return "maintenance_update";
  if (kind.startsWith("booking")) return "booking_update";
  if (kind.startsWith("lease")) return "lease_expiring";
  if (kind.startsWith("verification") || kind.startsWith("kyc")) return "verification_update";
  // Payment decisions, activation, expiry. Discount/access-changed notices stay in-app.
  if (
    kind.startsWith("subscription_") &&
    kind !== "subscription_discount_applied" &&
    kind !== "subscription_access_changed"
  ) {
    return "subscription_update";
  }
  // Everything else (live feed, meter OCR…) stays in-app only.
  return null;
}

/** Events that concern a room/booking: the message must say that terms apply and where to read them. */
const TERMS_NOTE = "Rent, deposit, room type & house rules = your accepted terms (Rentalos > Bookings).";
const MAX_DETAIL = 200;

/**
 * Build WhatsApp variable {{2}}. For room/booking messages the terms reminder is always kept
 * (the main text is shortened to make room for it); other events are only length-capped.
 * Meta rejects newlines/tabs inside variables, so whitespace is collapsed.
 */
export function detailWithTerms(event: WhatsAppEventType, body: string | null | undefined): string {
  const main = (body ?? "Open Rentalos for details").replace(/\s+/g, " ").trim() || "Open Rentalos for details";
  if (event !== "booking_update") return main.slice(0, MAX_DETAIL);
  const room = MAX_DETAIL - TERMS_NOTE.length - 1;
  const head = main.length > room ? main.slice(0, room - 1).trimEnd() + "…" : main;
  return `${head} ${TERMS_NOTE}`;
}
