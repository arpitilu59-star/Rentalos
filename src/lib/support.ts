import { z } from "zod";

export const SUPPORT = {
  phone: "+919252199283",
  displayPhone: "+91 92521 99283",
  email: "support@rentalos.in",
} as const;
export const SUPPORT_CATEGORIES = {
  booking: "Room or booking",
  payments: "Rent or payment",
  account: "My account",
  technical: "App or website issue",
  other: "Something else",
} as const;
const singleLine = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !/[\r\n]/.test(s) && !s.includes(String.fromCharCode(0)), "Use a single line.");
export const SupportQuery = z.object({
  id: z.string().uuid(),
  name: singleLine(2, 100),
  email: z.string().trim().email().max(254),
  phone: z
    .string()
    .trim()
    .max(20)
    .regex(/^[+\d ()-]*$/)
    .default(""),
  category: z.enum(["booking", "payments", "account", "technical", "other"]),
  subject: singleLine(4, 150),
  message: z.string().trim().min(20).max(4000),
  website: z.string().max(200).default(""),
  consent: z.literal(true),
});
export type SupportQueryInput = z.infer<typeof SupportQuery>;
export function supportEmailText(q: SupportQueryInput) {
  return `RentalOS support query\nReference: ${q.id}\nName: ${q.name}\nEmail: ${q.email}\nPhone: ${q.phone || "Not provided"}\nCategory: ${SUPPORT_CATEGORIES[q.category]}\nSubject: ${q.subject}\n\n${q.message}`;
}
