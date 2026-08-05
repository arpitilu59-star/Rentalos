import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://connector-gateway.lovable.dev/twilio";

const SendSchema = z.object({
  to: z.string().min(8).max(20),           // E.164, e.g. +9198xxxxxxxx
  from: z.string().min(8).max(20),         // E.164 of WhatsApp sender (Twilio approved or sandbox)
  body: z.string().min(1).max(1600),
  mediaUrl: z.string().url().optional(),
});

export const sendWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SendSchema.parse(input))
  .handler(async ({ data }) => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const TWILIO_API_KEY = process.env.TWILIO_API_KEY;
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");
    if (!TWILIO_API_KEY) throw new Error("TWILIO_API_KEY not configured — connect Twilio in Connectors");

    const toClean = data.to.replace(/[^\d+]/g, "");
    const fromClean = data.from.replace(/[^\d+]/g, "");
    const params = new URLSearchParams({
      To: `whatsapp:${toClean.startsWith("+") ? toClean : "+" + toClean}`,
      From: `whatsapp:${fromClean.startsWith("+") ? fromClean : "+" + fromClean}`,
      Body: data.body,
    });
    if (data.mediaUrl) params.append("MediaUrl", data.mediaUrl);

    const res = await fetch(`${GATEWAY}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": TWILIO_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    });
    const result: unknown = await res.json();
    if (!res.ok) {
      const msg = (result && typeof result === "object" && "message" in result)
        ? String((result as { message?: unknown }).message)
        : `Twilio error ${res.status}`;
      throw new Error(msg);
    }
    return { ok: true, sid: (result as { sid?: string }).sid ?? null };
  });
