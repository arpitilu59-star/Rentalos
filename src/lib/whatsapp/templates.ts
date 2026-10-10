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
  generic_update: "rentalos_generic_update",
};

export function templateFor(event: WhatsAppEventType): string {
  return process.env[`META_TEMPLATE_${event.toUpperCase()}`] || DEFAULTS[event];
}

/** Map an in-app notification `kind` to a WhatsApp event. */
export function eventForNotificationKind(kind: string): WhatsAppEventType | null {
  if (kind === "bill_due_soon") return "rent_due_soon";
  if (kind === "bill_landlord_reminder") return "rent_overdue";
  if (kind === "bill_new") return "rent_new_bill";
  if (kind === "payment_submitted") return "payment_submitted";
  if (kind === "payment_verified" || kind === "payment_approved") return "payment_verified";
  if (kind.startsWith("maintenance")) return "maintenance_update";
  if (kind.startsWith("booking")) return "booking_update";
  if (kind.startsWith("lease")) return "lease_expiring";
  if (kind.startsWith("verification") || kind.startsWith("kyc")) return "verification_update";
  // Everything else (live feed, meter OCR…) stays in-app only.
  return null;
}
