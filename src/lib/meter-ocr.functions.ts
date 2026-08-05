import { createServerFn } from "@tanstack/react-start";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RATE_LIMIT = 10;
const WINDOW_MS = 60_000;

const Input = z.object({
  imageBase64: z.string().min(100).max(8_000_000),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]).default("image/jpeg"),
});

export const detectMeterReading = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Durable rate limit (per-user, per-minute) via Postgres
    const since = new Date(Date.now() - WINDOW_MS).toISOString();
    const { count, error: rateErr } = await supabase
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .eq("kind", "meter_ocr")
      .gte("created_at", since);
    if (!rateErr && (count ?? 0) >= RATE_LIMIT) {
      throw new Error("Too many requests. Try again in ~1 min.");
    }
    await supabase.from("ai_usage_events").insert({ owner_id: userId, kind: "meter_ocr" });

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("LOVABLE_API_KEY missing");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-2.5-flash");

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "You are reading an electricity meter. Look at the meter display and return ONLY the numeric reading shown (the units consumed total). Ignore decimal places after a red digit. Respond with just the integer number, nothing else. If unreadable, respond with 0.",
            },
            { type: "image", image: `data:${data.mimeType};base64,${data.imageBase64}` },
          ],
        },
      ],
    });

    const cleaned = text.replace(/[^\d.]/g, "");
    const reading = parseFloat(cleaned);
    return { reading: isFinite(reading) ? reading : 0, raw: text };
  });
