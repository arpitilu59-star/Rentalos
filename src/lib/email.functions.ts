import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const Input = z.object({
  to: z.string().email().max(255),
  fromName: z.string().min(1).max(120).default("RentDesk"),
  subject: z.string().min(1).max(200),
  html: z.string().min(1).max(50_000),
});

/**
 * Sends a transactional email via Resend's HTTP API.
 * Uses `onboarding@resend.dev` as the from address so it works without
 * domain verification. Landlord can later move to a verified domain.
 */
export const sendEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.RESEND_API_KEY;
    if (!key) throw new Error("RESEND_API_KEY not configured");

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${data.fromName} <onboarding@resend.dev>`,
        to: [data.to],
        subject: data.subject,
        html: data.html,
      }),
    });
    const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string; name?: string };
    if (!res.ok) {
      throw new Error(json.message || json.name || `Resend error ${res.status}`);
    }
    return { ok: true, id: json.id ?? null };
  });
