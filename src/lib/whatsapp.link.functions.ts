import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Link a phone number to a user via a 6-digit code sent on WhatsApp.
 * Consent model: linking verifies ownership; opt-in is a separate switch.
 * All writes use the service role so users can never self-verify.
 */

const PURPOSE = "whatsapp_link";
const CODE_TTL_MS = 10 * 60_000;
const MAX_CODE_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

const PhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s\-()]/g, ""))
    .refine(
      (v) => /^\+[1-9]\d{7,14}$/.test(v),
      "Enter the number with country code, e.g. +919876543210",
    ),
});

async function hashCode(code: string, userId: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${code}:${userId}`));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomCode(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(n).padStart(6, "0");
}

export const getMyWhatsAppLink = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from("whatsapp_links" as any)
      .select("phone_e164, verified, opted_in")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error("Couldn't load WhatsApp settings. Please try again.");
    const { isMetaConfigured } = await import("./whatsapp/meta-client");
    return {
      link: (data as { phone_e164: string; verified: boolean; opted_in: boolean } | null) ?? null,
      // Tells the UI whether messages are real or simulated. Never a secret.
      liveDelivery: isMetaConfigured(),
    };
  });

export const startWhatsAppLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => PhoneSchema.parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { getAdmin } = await import("./whatsapp/db");
    const { sendTextMessage } = await import("./whatsapp/meta-client");
    const admin = await getAdmin();

    const { data: taken } = await admin
      .from("whatsapp_links")
      .select("user_id, verified")
      .eq("phone_e164", data.phone)
      .maybeSingle();
    if (taken && taken.user_id !== userId && taken.verified) {
      throw new Error("This number is already linked to another account.");
    }

    // Rate limit code sends per user.
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await admin
      .from("admin_otp_codes")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("purpose", PURPOSE)
      .gte("created_at", hourAgo);
    if ((count ?? 0) >= MAX_SENDS_PER_HOUR)
      throw new Error("Too many codes requested. Try again in an hour.");

    const { error: upErr } = await admin.from("whatsapp_links").upsert(
      {
        user_id: userId,
        phone_e164: data.phone,
        verified: false,
        opted_in: false,
        linked_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    );
    if (upErr) {
      if (upErr.code === "23505")
        throw new Error("This number is already linked to another account.");
      throw new Error("Couldn't save your number. Please try again.");
    }

    const code = randomCode();
    const { error: codeErr } = await admin.from("admin_otp_codes").insert({
      user_id: userId,
      code_hash: await hashCode(code, userId),
      purpose: PURPOSE,
      expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    });
    if (codeErr) throw new Error("Couldn't create a verification code. Please try again.");

    const sent = await sendTextMessage(
      data.phone,
      `Your Rentalos verification code is ${code}. It expires in 10 minutes.`,
    );
    if (!sent.ok)
      throw new Error("Couldn't send the WhatsApp message. Check the number and try again.");
    // In mock mode nothing was delivered — say so rather than pretend.
    return { sent: true, mocked: sent.mocked };
  });

export const confirmWhatsAppLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        code: z
          .string()
          .trim()
          .regex(/^\d{6}$/, "Enter the 6-digit code"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();

    const { data: row, error } = await admin
      .from("admin_otp_codes")
      .select("id, code_hash, attempts, expires_at")
      .eq("user_id", userId)
      .eq("purpose", PURPOSE)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error("Couldn't check the code. Please try again.");
    if (!row || new Date(row.expires_at).getTime() < Date.now()) {
      throw new Error("This code has expired. Request a new one.");
    }
    if (row.attempts >= MAX_CODE_ATTEMPTS)
      throw new Error("Too many wrong attempts. Request a new code.");

    if ((await hashCode(data.code, userId)) !== row.code_hash) {
      await admin
        .from("admin_otp_codes")
        .update({ attempts: row.attempts + 1 })
        .eq("id", row.id);
      throw new Error("That code is incorrect.");
    }

    const now = new Date().toISOString();
    await admin.from("admin_otp_codes").update({ used_at: now }).eq("id", row.id);
    const { error: linkErr } = await admin
      .from("whatsapp_links")
      .update({ verified: true, opted_in: true, last_verified_at: now })
      .eq("user_id", userId);
    if (linkErr) throw new Error("Couldn't finish linking. Please try again.");
    return { ok: true };
  });

export const setWhatsAppOptIn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ optedIn: z.boolean() }).parse(i))
  .handler(async ({ data, context }) => {
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    const { error } = await admin
      .from("whatsapp_links")
      .update({ opted_in: data.optedIn })
      .eq("user_id", context.userId)
      .eq("verified", true);
    if (error) throw new Error("Couldn't update your preference. Please try again.");
    return { ok: true };
  });

export const unlinkWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    const { error } = await admin.from("whatsapp_links").delete().eq("user_id", context.userId);
    if (error) throw new Error("Couldn't unlink. Please try again.");
    return { ok: true };
  });
