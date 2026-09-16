/**
 * Single source of truth for subscription plans.
 *
 * Pricing is intentionally NOT hardcoded into any page — change it here
 * and every surface (public pricing page, in-app upgrade prompts,
 * limit checks) follows.
 *
 * `priceMonthly: null` means "not finalised yet" and renders as
 * "Coming soon" rather than a made-up number. Set a real number when
 * business pricing is decided.
 *
 * IMPORTANT: no payment gateway is connected in this project. The
 * existing `subscriptions` table records a plan and a manually-verified
 * UPI reference — an admin verifies payment by hand (see
 * /admin + payment-verify). Nothing here marks a payment successful on
 * its own, and no checkout flow is faked.
 */

export type PlanId = "free" | "pro" | "business";

export type Plan = {
  id: PlanId;
  name: string;
  tagline: string;
  /** null = pricing not finalised; UI shows "Coming soon". */
  priceMonthly: number | null;
  /** Hard limits enforced server-side. null = unlimited. */
  limits: {
    properties: number | null;
    rooms: number | null;
  };
  /** Features live today. */
  features: string[];
  /** Honestly separated — not yet built. */
  comingSoon?: string[];
  highlighted?: boolean;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    tagline: "For a single small property.",
    priceMonthly: 0,
    limits: { properties: 1, rooms: 10 },
    features: [
      "List 1 property with up to 10 rooms",
      "Publish to the Rentalos marketplace",
      "Tenant management",
      "Rent & bill generation",
      "Electricity meter tracking",
      "Security deposit tracking",
      "Maintenance tickets",
      "Booking requests from tenants",
      "Landlord identity verification",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "For landlords running multiple properties.",
    priceMonthly: null,
    limits: { properties: 10, rooms: 100 },
    features: [
      "Everything in Free",
      "Up to 10 properties and 100 rooms",
      "Live-verified video on listings",
      "Payment verification workflow",
      "Move-in / move-out records",
      "Document storage & verification",
    ],
    comingSoon: ["WhatsApp rent reminders", "AI meter reading (OCR)", "Advanced analytics"],
    highlighted: true,
  },
  {
    id: "business",
    name: "Business",
    tagline: "For societies and property managers.",
    priceMonthly: null,
    limits: { properties: null, rooms: null },
    features: [
      "Everything in Pro",
      "Unlimited properties and rooms",
      "Partner organization account",
      "Bulk CSV inventory import",
      "Keep using your existing management software",
    ],
    comingSoon: ["Direct API sync", "Multi-user organization accounts", "Advanced reporting"],
  },
];

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function formatPlanPrice(plan: Plan): string {
  if (plan.priceMonthly === null) return "Coming soon";
  if (plan.priceMonthly === 0) return "Free";
  return `₹${plan.priceMonthly.toLocaleString("en-IN")}/mo`;
}
