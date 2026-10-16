/** Razorpay helpers — server only. Secrets never leave the server. */
import { createHmac, timingSafeEqual } from "node:crypto";

export function razorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function hmacHex(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEq(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout callback: HMAC_SHA256(order_id|payment_id, key_secret). */
export function verifyCheckoutSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !signature || !secret) return false;
  return safeEq(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** Webhook: HMAC_SHA256(raw body, webhook_secret) in X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!secret || !signature) return false;
  return safeEq(hmacHex(secret, rawBody), signature);
}

export async function createRazorpayOrder(amountPaise: number, receipt: string, notes: Record<string, string>) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes }),
  });
  const json = (await res.json().catch(() => ({}))) as { id?: string; error?: { description?: string } };
  if (!res.ok || !json.id) throw new Error(json.error?.description ?? `Razorpay error (HTTP ${res.status})`);
  return json.id;
}

/** Fetch a payment to confirm status/amount/order when only ids are trusted (checkout callback). */
export async function fetchRazorpayPayment(paymentId: string) {
  const auth = Buffer.from(`${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const json = (await res.json().catch(() => ({}))) as { status?: string; amount?: number; order_id?: string };
  if (!res.ok) throw new Error(`Razorpay lookup failed (HTTP ${res.status})`);
  return json;
}

export type WebhookPayment = { orderId: string; paymentId: string; amountPaise: number };

/** Extract a captured payment from a webhook body; null for events we ignore. */
export function parseCapturedEvent(body: unknown): WebhookPayment | null {
  const b = body as { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; status?: string } } } };
  if (b?.event !== "payment.captured" && b?.event !== "order.paid") return null;
  const e = b.payload?.payment?.entity;
  if (!e?.id || !e.order_id || typeof e.amount !== "number") return null;
  if (e.status && e.status !== "captured") return null;
  return { orderId: e.order_id, paymentId: e.id, amountPaise: e.amount };
}
