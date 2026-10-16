import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";
import { getUserEntitlements } from "@/lib/subscription/entitlements";

/** Public: plans + feature matrix straight from the database (no auth). */
export const getPublicPlans = createServerFn({ method: "GET" }).handler(async () => {
  const admin = await getAdmin();
  const [plans, feats, ents] = await Promise.all([
    admin.from("subscription_plans").select("*").eq("public_visible", true).order("sort_order"),
    admin.from("feature_catalog").select("*").eq("visible", true).order("sort_order"),
    admin.from("plan_entitlements").select("*"),
  ]);
  if (plans.error || feats.error || ents.error)
    throw new Error("Couldn't load plans. Please try again.");
  return {
    plans: plans.data ?? [],
    features: feats.data ?? [],
    entitlements: ents.data ?? [],
  };
});

/** The signed-in user's plan, status, expiry, entitlements, personalised prices, payments. */
export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = await getAdmin();
    const uid = context.userId;
    const ent = await getUserEntitlements(uid);
    const [plansRes, payments, settings] = await Promise.all([
      admin.from("subscription_plans").select("*").eq("public_visible", true).order("sort_order"),
      admin
        .from("subscription_payments")
        .select(
          "id, plan_id, amount, original_amount, discount_amount, status, clarification_requested, admin_note, transaction_reference, submitted_at, reviewed_at",
        )
        .eq("user_id", uid)
        .order("submitted_at", { ascending: false })
        .limit(20),
      admin
        .from("subscription_settings")
        .select("upi_id, payee_name, instructions, qr_path")
        .eq("id", 1)
        .maybeSingle(),
    ]);
    const plans = plansRes.data ?? [];
    const prices: Record<string, { original: number; discount: number; payable: number }> = {};
    for (const p of plans) {
      if (p.code === "FREE") continue;
      const { data } = await admin.rpc("compute_payable", { _uid: uid, _plan_code: p.code });
      if (data)
        prices[p.code] = {
          original: Number(data.original),
          discount: Number(data.discount),
          payable: Number(data.payable),
        };
    }
    let qrUrl: string | null = null;
    if (settings.data?.qr_path) {
      const { data } = admin.storage.from("payment-qr").getPublicUrl(settings.data.qr_path);
      qrUrl = data?.publicUrl ?? null;
    }
    return {
      entitlements: ent,
      plans,
      prices,
      payments: payments.data ?? [],
      payment: {
        upiId: settings.data?.upi_id ?? null,
        payeeName: settings.data?.payee_name ?? null,
        instructions: settings.data?.instructions ?? null,
        qrUrl,
      },
    };
  });

/** Light call used by the layout/nav gate. */
export const getMyEntitlements = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => getUserEntitlements(context.userId));

const SubmitInput = z.object({
  planCode: z.enum(["RENTDESK", "RENTALOS_MANAGEMENT"]),
  transactionReference: z.string().trim().max(64).optional().default(""),
  claimedAmount: z.number().min(0).max(100000).optional(),
  proofPath: z.string().max(300).nullable().optional(),
  note: z.string().trim().max(500).optional(),
});

/** Price is computed in the database; the client's amount is only recorded as a claim. */
export const submitSubscriptionPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => SubmitInput.parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: res, error } = await admin.rpc("submit_subscription_payment", {
      _uid: context.userId,
      _plan_code: data.planCode,
      _txn: data.transactionReference,
      _claimed: data.claimedAmount ?? null,
      _proof: data.proofPath ?? null,
      _note: data.note ?? null,
    });
    if (error) throw new Error(cleanDbError(error.message));
    return res as { payment_id: string; payable: number; status: string };
  });

export const cancelMyPendingPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ paymentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const admin = await getAdmin();
    const { data: row, error } = await admin
      .from("subscription_payments")
      .update({ status: "CANCELLED" })
      .eq("id", data.paymentId)
      .eq("user_id", context.userId)
      .eq("status", "PENDING_REVIEW")
      .select("id")
      .maybeSingle();
    if (error) throw new Error("Couldn't cancel. Please try again.");
    if (!row) throw new Error("This payment can no longer be cancelled.");
    await admin
      .from("user_subscriptions")
      .update({ status: "FREE", payment_status: "CANCELLED" })
      .eq("user_id", context.userId)
      .eq("status", "PENDING");
    return { ok: true };
  });

export function cleanDbError(msg: string): string {
  return (
    msg.replace(/^.*?ERROR:\s*/, "").slice(0, 300) || "Something went wrong. Please try again."
  );
}

/** Is automatic (Razorpay) payment available? Manual UPI-QR proof stays as the fallback. */
export const getGatewayStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { razorpayConfigured } = await import("@/lib/razorpay.server");
    return { enabled: razorpayConfigured(), keyId: razorpayConfigured() ? (process.env.RAZORPAY_KEY_ID as string) : null };
  });

/** Create a Razorpay order for the database-computed price and reserve a DRAFT payment. */
export const startGatewayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ planCode: z.enum(["RENTDESK", "RENTALOS_MANAGEMENT"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { razorpayConfigured, createRazorpayOrder } = await import("@/lib/razorpay.server");
    if (!razorpayConfigured()) throw new Error("Online payment isn't enabled yet. Please pay by QR.");
    const admin = await getAdmin();
    const { data: amount, error: qe } = await admin.rpc("gateway_quote", { _uid: context.userId, _plan_code: data.planCode });
    if (qe) throw new Error(cleanDbError(qe.message));
    const paise = Math.round(Number(amount) * 100);
    if (!(paise >= 100)) throw new Error("No payment is needed for this plan.");
    let orderId: string;
    try {
      orderId = await createRazorpayOrder(paise, `sub_${Date.now()}`, { user_id: context.userId, plan: data.planCode });
    } catch (e) {
      console.error("[razorpay] order failed:", e);
      throw new Error("Couldn't start the payment. Please try again or pay by QR.");
    }
    const { error } = await admin.rpc("create_gateway_payment", {
      _uid: context.userId,
      _plan_code: data.planCode,
      _gateway: "razorpay",
      _order_id: orderId,
    });
    if (error) throw new Error(cleanDbError(error.message));
    return { orderId, amountPaise: paise, keyId: process.env.RAZORPAY_KEY_ID as string };
  });

/** Checkout success callback: verify the signature, then activate immediately (webhook is the safety net). */
export const confirmGatewayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ orderId: z.string().min(5).max(64), paymentId: z.string().min(5).max(64), signature: z.string().min(10).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { verifyCheckoutSignature, fetchRazorpayPayment } = await import("@/lib/razorpay.server");
    if (!verifyCheckoutSignature(data.orderId, data.paymentId, data.signature, process.env.RAZORPAY_KEY_SECRET ?? "")) {
      throw new Error("Payment couldn't be verified. If money was deducted it will activate automatically within a few minutes.");
    }
    const admin = await getAdmin();
    const { data: mine } = await admin
      .from("subscription_payments").select("id").eq("gateway", "razorpay").eq("gateway_order_id", data.orderId).eq("user_id", context.userId).maybeSingle();
    if (!mine) throw new Error("Order not found for your account.");
    const pay = await fetchRazorpayPayment(data.paymentId);
    if (pay.order_id !== data.orderId || (pay.status !== "captured" && pay.status !== "authorized")) {
      throw new Error("Payment isn't confirmed yet. It will activate automatically as soon as the bank confirms.");
    }
    const { data: res, error } = await admin.rpc("settle_gateway_payment", {
      _gateway: "razorpay", _order_id: data.orderId, _gateway_payment_id: data.paymentId, _amount_paise: pay.amount ?? 0,
    });
    if (error) throw new Error(cleanDbError(error.message));
    return res as { status: string; expires_at?: string };
  });
