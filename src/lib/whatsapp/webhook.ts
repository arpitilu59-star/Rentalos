/**
 * Meta WhatsApp webhook handlers (GET verify + POST events).
 * Design rules:
 *  - Verify X-Hub-Signature-256 when the app secret is set; refuse unsigned
 *    traffic when live credentials are configured (fail closed).
 *  - Always answer 200 to well-formed signed deliveries, even if one message
 *    fails internally — otherwise Meta retries the whole batch forever.
 *  - Each message/status is isolated in its own try/catch.
 *  - Inbound messages are idempotent on provider message id (Meta retries).
 */
import { detectIntent, type Intent } from "./intents";
import { isMetaConfigured, sendTextMessage } from "./meta-client";
import { verifyMetaSignature } from "./signature";
import { getAdmin } from "./db";

export type MetaMessage = {
  id: string;
  from: string;
  type: string;
  text?: { body?: string };
};
export type MetaStatus = {
  id: string;
  status: string;
  errors?: { code?: number; title?: string; message?: string }[];
};
export type MetaChange = { value?: { messages?: MetaMessage[]; statuses?: MetaStatus[] } };
export type MetaPayload = { object?: string; entry?: { changes?: MetaChange[] }[] };

const MAX_BODY_BYTES = 512 * 1024;
const text = (s: string, status: number) =>
  new Response(s, { status, headers: { "content-type": "text/plain" } });

export function handleWebhookVerify(url: URL): Response {
  const expected = process.env.META_WHATSAPP_VERIFY_TOKEN;
  if (!expected) {
    console.error("[whatsapp] webhook verify refused: META_WHATSAPP_VERIFY_TOKEN not set");
    return text("Webhook not configured", 500);
  }
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === expected && challenge) return text(challenge, 200);
  return text("Forbidden", 403);
}

export async function handleWebhookEvent(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return text("Payload too large", 413);

  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const ok = await verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret);
    if (!ok) {
      console.warn("[whatsapp] webhook rejected: bad signature");
      return text("Invalid signature", 401);
    }
  } else if (isMetaConfigured()) {
    console.error("[whatsapp] webhook refused: live credentials set but META_APP_SECRET missing");
    return text("Webhook not configured", 500);
  }

  let payload: MetaPayload;
  try {
    payload = JSON.parse(raw) as MetaPayload;
  } catch {
    return text("ignored", 200); // malformed — retrying won't help
  }
  if (payload?.object !== "whatsapp_business_account") return text("ignored", 200);

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const msg of change.value?.messages ?? []) {
        try {
          await handleIncomingMessage(msg);
        } catch (e) {
          console.error("[whatsapp] inbound message failed:", e instanceof Error ? e.message : e);
        }
      }
      for (const st of change.value?.statuses ?? []) {
        try {
          await handleStatusUpdate(st);
        } catch (e) {
          console.error("[whatsapp] status update failed:", e instanceof Error ? e.message : e);
        }
      }
    }
  }
  return text("ok", 200);
}

const STATUS_MAP: Record<string, string> = {
  sent: "sent",
  delivered: "delivered",
  read: "read",
  failed: "failed",
};

export async function handleStatusUpdate(st: MetaStatus): Promise<void> {
  const mapped = STATUS_MAP[st.status];
  if (!st.id || !mapped) return;
  const supabaseAdmin = await getAdmin();
  const err = st.errors?.[0];
  const { error } = await supabaseAdmin
    .from("whatsapp_messages")
    .update({
      status: mapped,
      failure_reason:
        mapped === "failed"
          ? (err?.message ?? err?.title ?? "delivery failed").slice(0, 300)
          : null,
      updated_at: new Date().toISOString(),
    })
    .eq("provider_message_id", st.id)
    .eq("direction", "outbound");
  if (error) throw new Error(error.message);
}

const HELP_TEXT =
  "Rentalos here. You can ask:\n• When is my rent due?\n• What is my rent?\n• Payment status\n• Maintenance status\n• Dashboard link";

export async function handleIncomingMessage(msg: MetaMessage): Promise<void> {
  if (!msg?.id || !msg.from) return;
  const supabaseAdmin = await getAdmin();
  const phone = `+${msg.from.replace(/[^\d]/g, "")}`;

  const { data: link, error: linkErr } = await supabaseAdmin
    .from("whatsapp_links")
    .select("user_id, verified, opted_in")
    .eq("phone_e164", phone)
    .maybeSingle();
  if (linkErr) throw new Error(`link lookup: ${linkErr.message}`);
  // Unknown / unverified numbers get no data and no reply.
  if (!link || !link.verified) return;

  // Idempotency: Meta redelivers; the unique index rejects the second insert.
  const intent: Intent = msg.type === "text" ? detectIntent(msg.text?.body ?? "") : "UNKNOWN";
  const { error: logErr } = await supabaseAdmin.from("whatsapp_messages").insert({
    user_id: link.user_id,
    direction: "inbound",
    event_type: `inbound:${msg.type === "text" ? intent : "unsupported_type"}`,
    provider_message_id: msg.id,
    status: "received",
  });
  if (logErr) {
    if (logErr.code === "23505") return; // duplicate delivery
    throw new Error(`inbound log: ${logErr.message}`);
  }

  if (!link.opted_in) return; // consent revoked: log only, don't reply

  let reply: string;
  if (msg.type !== "text") {
    reply = "I can only read text messages for now. Send “help” to see what you can ask.";
  } else {
    try {
      reply = await resolveIntent(intent, link.user_id);
    } catch (e) {
      console.error("[whatsapp] intent resolution failed:", e instanceof Error ? e.message : e);
      reply =
        "Sorry, I couldn't fetch that right now. Please try again or open your Rentalos dashboard.";
    }
  }
  const sent = await sendTextMessage(phone, reply);
  if (!sent.ok) console.error("[whatsapp] reply failed:", sent.error);
}

const siteUrl = () => (process.env.SITE_URL || "https://rentalos.in").replace(/\/$/, "");
const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export async function resolveIntent(intent: Intent, userId: string): Promise<string> {
  if (intent === "HELP") return HELP_TEXT;
  if (intent === "OPEN_DASHBOARD") return `Open your dashboard: ${siteUrl()}/login`;
  if (intent === "UNKNOWN") return `I didn't understand that. ${HELP_TEXT}`;

  const supabaseAdmin = await getAdmin();

  // Tenant scope: only tenants linked to THIS user. Landlord scope: owner_id = user.
  const { data: tenants, error: tErr } = await supabaseAdmin
    .from("tenants")
    .select("id, room_id, rent_share")
    .eq("tenant_user_id", userId)
    .eq("active", true);
  if (tErr) throw new Error(tErr.message);
  const tenantIds = (tenants ?? []).map((t) => t.id);
  const isTenant = tenantIds.length > 0;

  if (intent === "GET_RENT_DUE_DATE" || intent === "GET_CURRENT_RENT") {
    if (isTenant) {
      const { data: bills, error } = await supabaseAdmin
        .from("bills")
        .select("due_date, total_amount")
        .in("tenant_id", tenantIds)
        .eq("status", "pending")
        .order("due_date", { ascending: true })
        .limit(1);
      if (error) throw new Error(error.message);
      const b = bills?.[0];
      if (b) return `Your next bill of ${inr(Number(b.total_amount))} is due on ${b.due_date}.`;
      const t = tenants![0];
      let rent = t.rent_share != null ? Number(t.rent_share) : null;
      if (rent == null) {
        const { data: room } = await supabaseAdmin
          .from("rooms")
          .select("rent_amount")
          .eq("id", t.room_id)
          .maybeSingle();
        rent = room?.rent_amount != null ? Number(room.rent_amount) : null;
      }
      return rent != null
        ? `No pending bill right now. Your monthly rent is ${inr(rent)}.`
        : "No pending bill right now.";
    }
    const { data: bills, error } = await supabaseAdmin
      .from("bills")
      .select("id, rooms!inner(owner_id)")
      .eq("rooms.owner_id", userId)
      .eq("status", "pending");
    if (error) throw new Error(error.message);
    return `You have ${bills?.length ?? 0} pending bill(s) across your rooms.`;
  }

  if (intent === "GET_PAYMENT_STATUS") {
    const q = supabaseAdmin
      .from("bills")
      .select("status, total_amount, due_date")
      .order("due_date", { ascending: false })
      .limit(1);
    const { data, error } = isTenant
      ? await q.in("tenant_id", tenantIds)
      : await q.eq("rooms.owner_id", userId);
    if (error) throw new Error(error.message);
    const b = data?.[0];
    return b
      ? `Latest bill (due ${b.due_date}, ${inr(Number(b.total_amount))}) is ${b.status}.`
      : "No bills found yet.";
  }

  if (intent === "GET_MAINTENANCE_STATUS") {
    const q = supabaseAdmin
      .from("maintenance_tickets")
      .select("title, status")
      .neq("status", "closed")
      .order("created_at", { ascending: false })
      .limit(3);
    const { data, error } = isTenant
      ? await q.in("tenant_id", tenantIds)
      : await q.eq("owner_id", userId);
    if (error) throw new Error(error.message);
    if (!data?.length) return "You have no open maintenance requests.";
    return "Open requests:\n" + data.map((d) => `• ${d.title} — ${d.status}`).join("\n");
  }
  return `I didn't understand that. ${HELP_TEXT}`;
}
