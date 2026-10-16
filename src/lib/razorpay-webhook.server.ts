import { parseCapturedEvent, verifyWebhookSignature } from "./razorpay.server";

/** POST /api/razorpay/webhook. 401 on bad signature; 200 once handled (idempotent) so Razorpay stops retrying. */
export async function handleRazorpayWebhook(request: Request): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const raw = await request.text();
  if (!verifyWebhookSignature(raw, request.headers.get("x-razorpay-signature"), process.env.RAZORPAY_WEBHOOK_SECRET)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Bad JSON", { status: 400 });
  }
  const evt = parseCapturedEvent(body);
  if (!evt) return new Response("ignored", { status: 200 });
  try {
    const { getAdmin } = await import("./whatsapp/db");
    const admin = await getAdmin();
    const { data, error } = await admin.rpc("settle_gateway_payment", {
      _gateway: "razorpay",
      _order_id: evt.orderId,
      _gateway_payment_id: evt.paymentId,
      _amount_paise: evt.amountPaise,
    });
    if (error) {
      // unknown order (not ours) -> ack; anything else -> 500 so Razorpay retries
      if (/Unknown order/i.test(error.message)) return new Response("unknown order", { status: 200 });
      console.error("[razorpay] settle failed:", error.message);
      return new Response("error", { status: 500 });
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    console.error("[razorpay] webhook error:", e);
    return new Response("error", { status: 500 });
  }
}
