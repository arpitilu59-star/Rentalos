import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";
import { getUserEntitlements } from "@/lib/subscription/entitlements";
import { cleanDbError } from "@/lib/subscription.functions";
import {
  ADMIN_PAYMENT_ROLES,
  ADMIN_SUBSCRIPTION_ROLES,
  ADMIN_SUBSCRIPTION_WRITE_ROLES,
} from "@/lib/subscription/keys";

/** Role gate, decided on the server from the validated JWT user id (never from the browser). */
export function roleAllowed(role: string | null | undefined, allowed: readonly string[]): boolean {
  return !!role && allowed.includes(role);
}

async function requireRole(userId: string, allowed: readonly string[]) {
  const admin = await getAdmin();
  const { data, error } = await admin
    .from("admin_users")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error("Couldn't verify your admin access. Please try again.");
  if (!data) throw new Error("Admin access required.");
  if (!roleAllowed(data.role, allowed))
    throw new Error("Your admin role isn't allowed to do this.");
  return { admin, role: data.role as string };
}
const reader = (uid: string) => requireRole(uid, ADMIN_SUBSCRIPTION_ROLES);
const writer = (uid: string) => requireRole(uid, ADMIN_SUBSCRIPTION_WRITE_ROLES);
const payer = (uid: string) => requireRole(uid, ADMIN_PAYMENT_ROLES);

const uuid = z.string().uuid();
const reason = z.string().trim().min(3, "A reason is required.").max(500);

function run<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>) {
  return Promise.resolve(p).then(({ data, error }) => {
    if (error) throw new Error(cleanDbError(error.message));
    return data;
  });
}

export const adminSubscriptionOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin, role } = await reader(context.userId);
    const now = new Date();
    const soon = new Date(now.getTime() + 7 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const count = async (build: (q: ReturnType<typeof admin.from>) => unknown) => {
      const { count } = (await build(admin.from("user_subscriptions"))) as { count: number | null };
      return count ?? 0;
    };
    const head = { count: "exact", head: true } as const;
    const [pending, active, expired, expiringSoon, suspended, free] = await Promise.all([
      admin.from("subscription_payments").select("id", head).eq("status", "PENDING_REVIEW"),
      count((q) => q.select("id", head).eq("status", "ACTIVE")),
      count((q) => q.select("id", head).eq("status", "EXPIRED")),
      admin
        .from("user_subscriptions")
        .select("id", head)
        .eq("status", "ACTIVE")
        .lte("expires_at", soon)
        .gt("expires_at", now.toISOString()),
      count((q) => q.select("id", head).eq("status", "SUSPENDED")),
      count((q) => q.select("id", head).eq("status", "FREE")),
    ]);
    const approved = await admin
      .from("subscription_payments")
      .select("amount")
      .eq("status", "APPROVED")
      .gte("reviewed_at", monthStart);
    const rev = (approved.data ?? []).reduce(
      (s: number, r: { amount: number }) => s + Number(r.amount),
      0,
    );
    const byPlan = await admin
      .from("user_subscriptions")
      .select("plan_id, status, subscription_plans(code)")
      .eq("status", "ACTIVE");
    const planCounts: Record<string, number> = {};
    for (const r of (byPlan.data ?? []) as unknown as {
      subscription_plans: { code: string } | null;
    }[]) {
      const c = r.subscription_plans?.code ?? "?";
      planCounts[c] = (planCounts[c] ?? 0) + 1;
    }
    const actions = await admin
      .from("admin_audit_logs")
      .select("id, admin_user_id, action, target_id, metadata, created_at")
      .or(
        "action.like.subscription_%,action.like.payment_%,action.like.discount_%,action.like.feature_override_%,action.like.free_access_%,action.like.settings_%,action.like.plan_config_%",
      )
      .order("created_at", { ascending: false })
      .limit(25);
    return {
      role,
      pendingPayments: pending.count ?? 0,
      active,
      expired,
      expiringSoon: expiringSoon.count ?? 0,
      suspended,
      free,
      revenueThisMonth: rev,
      planCounts,
      recentActions: actions.data ?? [],
    };
  });

export const adminListPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        status: z
          .enum(["PENDING_REVIEW", "APPROVED", "REJECTED", "CANCELLED", "ALL"])
          .default("PENDING_REVIEW"),
      })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await payer(context.userId);
    let q = admin
      .from("subscription_payments")
      .select("*, subscription_plans(code, name)")
      .order("submitted_at", { ascending: false })
      .limit(100);
    if (data.status !== "ALL") q = q.eq("status", data.status);
    const rows = await run(q);
    const ids = [...new Set((rows as { user_id: string }[]).map((r) => r.user_id))];
    const profs = ids.length
      ? await run(admin.from("profiles").select("id, full_name, email, phone").in("id", ids))
      : [];
    const map = new Map((profs as { id: string }[]).map((p) => [p.id, p]));
    return (rows as { user_id: string }[]).map((r) => ({
      ...r,
      profile: map.get(r.user_id) ?? null,
    }));
  });

/** Short-lived signed link; proofs bucket is private. */
export const adminPaymentProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await payer(context.userId);
    const { data: p } = await admin
      .from("subscription_payments")
      .select("payment_proof_path")
      .eq("id", data.paymentId)
      .maybeSingle();
    if (!p?.payment_proof_path) throw new Error("No proof was uploaded for this payment.");
    const { data: signed, error } = await admin.storage
      .from("subscription-proofs")
      .createSignedUrl(p.payment_proof_path, 300);
    if (error || !signed) throw new Error("Couldn't open the proof. Please try again.");
    return { url: signed.signedUrl };
  });

export const adminDecidePayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        paymentId: uuid,
        decision: z.enum(["APPROVED", "REJECTED", "CLARIFICATION"]),
        note: z.string().trim().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await payer(context.userId);
    return run(
      admin.rpc("decide_subscription_payment", {
        _admin: context.userId,
        _payment: data.paymentId,
        _decision: data.decision,
        _note: data.note ?? null,
      }),
    );
  });

export const adminSearchUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ q: z.string().trim().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await reader(context.userId);
    const term = data.q.replace(/[%,()]/g, " ").trim();
    const isId = z.string().uuid().safeParse(term).success;
    let q = admin
      .from("profiles")
      .select("id, full_name, email, phone, mobile, primary_role")
      .limit(20);
    q = isId
      ? q.eq("id", term)
      : q.or(
          `full_name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%,mobile.ilike.%${term}%`,
        );
    const profiles = (await run(q)) as { id: string }[];
    const ids = profiles.map((p) => p.id);
    const subs = ids.length
      ? ((await run(
          admin
            .from("user_subscriptions")
            .select("user_id, status, expires_at, subscription_plans(code)")
            .in("user_id", ids),
        )) as {
          user_id: string;
        }[])
      : [];
    const m = new Map(subs.map((s) => [s.user_id, s]));
    return profiles.map((p) => ({ ...p, subscription: m.get(p.id) ?? null }));
  });

export const adminGetUserSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await reader(context.userId);
    const [profile, sub, payments, discounts, overrides, audit, ent, usage] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, email, phone, mobile, primary_role, created_at")
        .eq("id", data.userId)
        .maybeSingle(),
      admin
        .from("user_subscriptions")
        .select("*, subscription_plans(code, name)")
        .eq("user_id", data.userId)
        .maybeSingle(),
      admin
        .from("subscription_payments")
        .select("*, subscription_plans(code, name)")
        .eq("user_id", data.userId)
        .order("submitted_at", { ascending: false })
        .limit(20),
      admin
        .from("subscription_discounts")
        .select("*, subscription_plans(code, name)")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      admin
        .from("entitlement_overrides")
        .select("*")
        .eq("user_id", data.userId)
        .order("created_at", { ascending: false }),
      admin
        .from("admin_audit_logs")
        .select("id, admin_user_id, action, metadata, created_at")
        .eq("target_id", data.userId)
        .order("created_at", { ascending: false })
        .limit(30),
      getUserEntitlements(data.userId),
      Promise.all([
        admin
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", data.userId),
        admin
          .from("rooms")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", data.userId),
      ]),
    ]);
    if (!profile.data) throw new Error("User not found.");
    return {
      profile: profile.data,
      subscription: sub.data,
      payments: payments.data ?? [],
      discounts: discounts.data ?? [],
      overrides: overrides.data ?? [],
      audit: audit.data ?? [],
      entitlements: ent,
      usage: { properties: usage[0].count ?? 0, rooms: usage[1].count ?? 0 },
    };
  });

export const adminApplySubscriptionAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: uuid,
        action: z.enum(["assign", "extend", "reduce", "cancel", "suspend", "reactivate"]),
        planCode: z.enum(["FREE", "RENTDESK", "RENTALOS_MANAGEMENT"]).optional(),
        months: z.number().int().min(1).max(120).nullable().optional(),
        reason,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    return run(
      admin.rpc("admin_apply_subscription_action", {
        _admin: context.userId,
        _target: data.userId,
        _action: data.action,
        _plan_code: data.planCode ?? null,
        _months: data.months ?? null,
        _reason: data.reason,
      }),
    );
  });

export const adminSetDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: uuid,
        planCode: z.enum(["RENTDESK", "RENTALOS_MANAGEMENT"]),
        kind: z.enum(["fixed", "percent", "free"]),
        value: z.number().min(0).max(100000).nullable().optional(),
        months: z.number().int().min(1).max(36).default(1),
        expiresAt: z.string().datetime().nullable().optional(),
        discountId: uuid.nullable().optional(),
        reason,
      })
      .refine((v) => v.kind === "free" || (v.value !== null && v.value !== undefined), {
        message: "Enter a discount value.",
      })
      .refine((v) => v.kind !== "percent" || (v.value ?? 0) <= 100, {
        message: "Percent can't exceed 100.",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    return run(
      admin.rpc("admin_set_discount", {
        _admin: context.userId,
        _target: data.userId,
        _plan_code: data.planCode,
        _kind: data.kind,
        _value: data.value ?? null,
        _months: data.months,
        _starts: null,
        _expires: data.expiresAt ?? null,
        _reason: data.reason,
        _discount_id: data.discountId ?? null,
      }),
    );
  });

export const adminRevokeDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ discountId: uuid, reason }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    await run(
      admin.rpc("admin_revoke_discount", {
        _admin: context.userId,
        _discount: data.discountId,
        _reason: data.reason,
      }),
    );
    return { ok: true };
  });

export const adminSetOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        userId: uuid,
        feature: z.string().min(2).max(60),
        enabled: z.boolean(),
        expiresAt: z.string().datetime().nullable().optional(),
        reason,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    return run(
      admin.rpc("admin_set_override", {
        _admin: context.userId,
        _target: data.userId,
        _feature: data.feature,
        _enabled: data.enabled,
        _expires: data.expiresAt ?? null,
        _reason: data.reason,
      }),
    );
  });

export const adminRevokeOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ overrideId: uuid, reason }).parse(d))
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    await run(
      admin.rpc("admin_revoke_override", {
        _admin: context.userId,
        _override: data.overrideId,
        _reason: data.reason,
      }),
    );
    return { ok: true };
  });

/** Plans + matrix for editing. Edits change plan_entitlements/price only; a 4th plan can't exist (CHECK). */
export const adminGetPlanConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { admin } = await reader(context.userId);
    const [plans, feats, ents, settings] = await Promise.all([
      admin.from("subscription_plans").select("*").order("sort_order"),
      admin.from("feature_catalog").select("*").order("sort_order"),
      admin.from("plan_entitlements").select("*"),
      admin.from("subscription_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    let qrUrl: string | null = null;
    if (settings.data?.qr_path)
      qrUrl =
        admin.storage.from("payment-qr").getPublicUrl(settings.data.qr_path).data?.publicUrl ??
        null;
    return {
      plans: plans.data ?? [],
      features: feats.data ?? [],
      entitlements: ents.data ?? [],
      settings: settings.data ?? null,
      qrUrl,
    };
  });

export const adminUpdatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        planId: uuid,
        priceInr: z.number().min(0).max(100000).optional(),
        active: z.boolean().optional(),
        entitlements: z
          .array(
            z.object({
              featureKey: z.string().max(60),
              enabled: z.boolean(),
              limitValue: z.number().int().min(0).nullable().optional(),
            }),
          )
          .max(50)
          .optional(),
        reason,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin, role } = await writer(context.userId);
    if (!["root_owner", "full_admin"].includes(role))
      throw new Error("Only a full admin can change plan pricing or what a plan includes.");
    const { data: before } = await admin
      .from("subscription_plans")
      .select("code, price_inr, active")
      .eq("id", data.planId)
      .maybeSingle();
    if (!before) throw new Error("Plan not found.");
    if (before.code === "FREE" && (data.active === false || (data.priceInr ?? 0) > 0))
      throw new Error("The Free plan must stay free and active.");
    if (data.priceInr !== undefined || data.active !== undefined) {
      await run(
        admin
          .from("subscription_plans")
          .update({
            ...(data.priceInr !== undefined ? { price_inr: data.priceInr } : {}),
            ...(data.active !== undefined ? { active: data.active } : {}),
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.planId)
          .select("id"),
      );
    }
    for (const e of data.entitlements ?? []) {
      await run(
        admin
          .from("plan_entitlements")
          .upsert(
            {
              plan_id: data.planId,
              feature_key: e.featureKey,
              enabled: e.enabled,
              limit_value: e.limitValue ?? null,
            },
            { onConflict: "plan_id,feature_key" },
          )
          .select("plan_id"),
      );
    }
    await admin.rpc("sub_audit", {
      _admin: context.userId,
      _target: context.userId,
      _action: "plan_config_changed",
      _prev: before,
      _new: {
        price_inr: data.priceInr,
        active: data.active,
        entitlements: data.entitlements?.length ?? 0,
        plan: before.code,
      },
      _reason: data.reason,
    });
    return { ok: true };
  });

export const adminUpdateSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        graceDays: z.number().int().min(0).max(30).optional(),
        upiId: z.string().trim().max(80).nullable().optional(),
        payeeName: z.string().trim().max(80).nullable().optional(),
        instructions: z.string().trim().max(600).nullable().optional(),
        qrPath: z.string().trim().max(200).nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    const patch: Record<string, unknown> = {
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    if (data.graceDays !== undefined) patch.grace_days = data.graceDays;
    if (data.upiId !== undefined) patch.upi_id = data.upiId || null;
    if (data.payeeName !== undefined) patch.payee_name = data.payeeName || null;
    if (data.instructions !== undefined) patch.instructions = data.instructions || null;
    if (data.qrPath !== undefined) patch.qr_path = data.qrPath || null;
    await run(admin.from("subscription_settings").update(patch).eq("id", 1).select("id"));
    await admin.rpc("sub_audit", {
      _admin: context.userId,
      _target: context.userId,
      _action: "settings_changed",
      _prev: {},
      _new: { ...patch, updated_by: undefined },
      _reason: "Payment settings updated",
    });
    return { ok: true };
  });

/** Admin uploads the QR through the server (admin-only) so no storage policy loosening is needed. */
export const adminUploadQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        base64: z.string().min(100).max(3_000_000),
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { admin } = await writer(context.userId);
    const ext = data.mime === "image/png" ? "png" : data.mime === "image/webp" ? "webp" : "jpg";
    const path = `qr-${Date.now()}.${ext}`;
    const buf = Buffer.from(data.base64, "base64");
    const { error } = await admin.storage
      .from("payment-qr")
      .upload(path, buf, { contentType: data.mime, upsert: false });
    if (error) throw new Error("Couldn't upload the QR. Please try again.");
    await run(
      admin
        .from("subscription_settings")
        .update({ qr_path: path, updated_by: context.userId, updated_at: new Date().toISOString() })
        .eq("id", 1)
        .select("id"),
    );
    await admin.rpc("sub_audit", {
      _admin: context.userId,
      _target: context.userId,
      _action: "settings_changed",
      _prev: {},
      _new: { qr_path: path },
      _reason: "Payment QR replaced",
    });
    return { path };
  });
