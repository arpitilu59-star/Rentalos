import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateSecret as otpGenSecret, generateURI as otpGenURI, verify as otpVerify } from "otplib";
import { createHash, randomInt, timingSafeEqual } from "crypto";

async function totpVerify(token: string, secret: string): Promise<boolean> {
  const r = await otpVerify({ secret, token, epochTolerance: 30 });
  return r.valid;
}

const generateSecret = (_opts?: { length?: number }) => otpGenSecret();
const generateURI = (opts: { issuer: string; label: string; secret: string }) =>
  otpGenURI({ issuer: opts.issuer, label: opts.label, secret: opts.secret });



const LOCKOUT_WINDOW_MIN = 15;
const LOCKOUT_THRESHOLD = 5;
const OTP_TTL_MIN = 10;

function sha256(s: string) {
  return createHash("sha256").update(s).digest("hex");
}

function getIp(): string | null {
  const xf = getRequestHeader("x-forwarded-for");
  return (xf?.split(",")[0]?.trim() ?? getRequestHeader("x-real-ip") ?? null) || null;
}

async function geolocate(ip: string | null): Promise<{ city: string | null; country: string | null }> {
  if (!ip || ip === "127.0.0.1" || ip.startsWith("::")) return { city: null, country: null };
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { signal: AbortSignal.timeout(2500) });
    if (!r.ok) return { city: null, country: null };
    const j = (await r.json()) as { city?: string; country_name?: string };
    return { city: j.city ?? null, country: j.country_name ?? null };
  } catch {
    return { city: null, country: null };
  }
}

/** Check whether an email is currently locked out from admin login. */
export const checkAdminLockout = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ email: z.string().email().max(255) }).parse(d))
  .handler(async ({ data }) => {
    const since = new Date(Date.now() - LOCKOUT_WINDOW_MIN * 60_000).toISOString();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("admin_login_events")
      .select("success,created_at")
      .eq("email", data.email)
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20);
    const events = (rows ?? []) as Array<{ success: boolean; created_at: string }>;
    // Count failures since last success
    let fails = 0;
    let lastFailAt: string | null = null;
    for (const ev of events) {
      if (ev.success) break;
      fails++;
      if (!lastFailAt) lastFailAt = ev.created_at;
    }
    const locked = fails >= LOCKOUT_THRESHOLD;
    let retry = 0;
    if (locked && lastFailAt) {
      const unlockAt = new Date(lastFailAt).getTime() + LOCKOUT_WINDOW_MIN * 60_000;
      retry = Math.max(0, Math.ceil((unlockAt - Date.now()) / 1000));
    }
    return { locked, fails, retry_in_seconds: retry };
  });

/** Record admin login with IP geolocation. Public (logs failures too). */
export const recordAdminLoginGeo = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        email: z.string().email().max(255),
        success: z.boolean(),
        device_fingerprint: z.string().max(256).optional(),
        reason: z.string().max(120).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const ip = getIp();
    const ua = getRequestHeader("user-agent") ?? null;
    const geo = await geolocate(ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("admin_login_events").insert({
      email: data.email,
      success: data.success,
      ip_address: ip,
      user_agent: ua,
      device_fingerprint: data.device_fingerprint ?? null,
      city: geo.city,
      country: geo.country,
      location: [geo.city, geo.country].filter(Boolean).join(", ") || null,
      reason: data.reason ?? null,
    });
    return { ok: true };
  });

/** Returns whether the current device is trusted (already passed email OTP). */
export const isDeviceTrusted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fingerprint: z.string().min(4).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("admin_trusted_devices")
      .select("id")
      .eq("user_id", userId)
      .eq("device_fingerprint", data.fingerprint)
      .maybeSingle();
    if (row) {
      await supabase
        .from("admin_trusted_devices")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", (row as { id: string }).id);
      return { trusted: true };
    }
    return { trusted: false };
  });

/** Sends a 6-digit OTP to the admin's email for new-device verification. */
export const sendNewDeviceOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ fingerprint: z.string().min(4).max(256) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Get email
    const { data: prof } = await supabase.from("profiles").select("email,full_name").eq("id", userId).maybeSingle();
    const email = (prof as { email?: string } | null)?.email;
    if (!email) throw new Error("No email on file");

    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const expires = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
    await supabase.from("admin_otp_codes").insert({
      user_id: userId,
      code_hash: sha256(code),
      purpose: "new_device",
      device_fingerprint: data.fingerprint,
      expires_at: expires,
    });

    // Send via Resend gateway
    const lov = process.env.LOVABLE_API_KEY;
    const resend = process.env.RESEND_API_KEY;
    if (lov && resend) {
      await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lov}`,
          "X-Connection-Api-Key": resend,
        },
        body: JSON.stringify({
          from: "Admin Security <onboarding@resend.dev>",
          to: [email],
          subject: `Admin login code: ${code}`,
          html: `<div style="font-family:system-ui,sans-serif"><h2>New device sign-in</h2><p>Your admin verification code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>This code expires in ${OTP_TTL_MIN} minutes. If you didn't try to sign in, change your password immediately.</p></div>`,
        }),
      }).catch(() => {});
    } else {
      console.warn("[admin-otp] Resend not configured; code:", code);
    }
    return { ok: true, sent_to: email.replace(/(.).+(@.+)/, "$1***$2") };
  });

/** Verify the email OTP and mark device as trusted. */
export const verifyNewDeviceOtp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ code: z.string().regex(/^\d{6}$/), fingerprint: z.string().min(4).max(256) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: rows } = await supabase
      .from("admin_otp_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("purpose", "new_device")
      .eq("device_fingerprint", data.fingerprint)
      .is("used_at", null)
      .order("created_at", { ascending: false })
      .limit(1);
    const otp = (rows as Array<{ id: string; code_hash: string; expires_at: string; attempts: number }> | null)?.[0];
    if (!otp) throw new Error("No active code. Request a new one.");
    if (new Date(otp.expires_at).getTime() < Date.now()) throw new Error("Code expired.");
    if (otp.attempts >= 5) throw new Error("Too many attempts. Request a new code.");

    const expected = Buffer.from(otp.code_hash, "hex");
    const actual = Buffer.from(sha256(data.code), "hex");
    const ok = expected.length === actual.length && timingSafeEqual(expected, actual);
    await supabase.from("admin_otp_codes").update({ attempts: otp.attempts + 1, used_at: ok ? new Date().toISOString() : null }).eq("id", otp.id);
    if (!ok) throw new Error("Invalid code.");

    await supabase.from("admin_trusted_devices").upsert(
      { user_id: userId, device_fingerprint: data.fingerprint, last_seen_at: new Date().toISOString() },
      { onConflict: "user_id,device_fingerprint" },
    );
    return { ok: true };
  });

/** Returns security settings for current admin (totp_enabled). */
export const getMySecurity = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("admin_security").select("totp_enabled,totp_verified_at").eq("user_id", userId).maybeSingle();
    return (data as { totp_enabled: boolean; totp_verified_at: string | null } | null) ?? { totp_enabled: false, totp_verified_at: null };
  });

/** Begin TOTP enrollment: returns secret + otpauth URL. Not yet enabled. */
export const beginTotpEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("email").eq("id", userId).maybeSingle();
    const email = (prof as { email?: string } | null)?.email ?? "admin";
    const secret = generateSecret({ length: 20 });
    const otpauth = generateURI({ issuer: "PG Smart Bill Admin", label: email, secret });

    await supabase.from("admin_security").upsert(
      { user_id: userId, totp_secret: secret, totp_enabled: false, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
    return { otpauth, secret };
  });

/** Confirm TOTP enrollment by verifying a code from the authenticator app. */
export const confirmTotpEnrollment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("admin_security").select("totp_secret").eq("user_id", userId).maybeSingle();
    const secret = (row as { totp_secret?: string } | null)?.totp_secret;
    if (!secret) throw new Error("Start enrollment first.");
    if (!(await totpVerify(data.code, secret))) throw new Error("Invalid code.");
    await supabase.from("admin_security").update({
      totp_enabled: true,
      totp_verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return { ok: true };
  });

/** Verify a TOTP code at login time. */
export const verifyTotpAtLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("admin_security").select("totp_secret,totp_enabled").eq("user_id", userId).maybeSingle();
    const r = row as { totp_secret?: string; totp_enabled?: boolean } | null;
    if (!r?.totp_enabled || !r.totp_secret) throw new Error("TOTP not enabled.");
    if (!(await totpVerify(data.code, r.totp_secret))) throw new Error("Invalid code.");
    return { ok: true };
  });

/** Disable TOTP after confirming the current code. */
export const disableTotp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase.from("admin_security").select("totp_secret,totp_enabled").eq("user_id", userId).maybeSingle();
    const r = row as { totp_secret?: string; totp_enabled?: boolean } | null;
    if (!r?.totp_enabled || !r.totp_secret) throw new Error("TOTP not enabled.");
    if (!(await totpVerify(data.code, r.totp_secret))) throw new Error("Invalid code.");
    await supabase.from("admin_security").update({
      totp_enabled: false,
      totp_secret: null,
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId);
    return { ok: true };
  });
