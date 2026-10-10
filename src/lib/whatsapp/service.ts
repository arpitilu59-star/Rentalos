/**
 * Outbound WhatsApp pipeline — INTERNAL helpers only (server-side).
 * Deliberately NOT a createServerFn: an unauthenticated RPC that sends
 * messages to arbitrary users would be an abuse vector.
 *
 * Every stage is guarded: a failure is logged + recorded, never thrown to
 * the caller, so the in-app notification flow can't be broken by WhatsApp.
 */
import { sendTemplateMessage, type SendResult } from "./meta-client";
import { templateFor, type WhatsAppEventType } from "./templates";

export type DispatchOutcome =
  | { status: "sent" | "mocked"; messageId: string }
  | { status: "skipped"; reason: "no_link" | "not_opted_in" | "not_verified" | "duplicate" }
  | { status: "failed"; reason: string };

const MAX_ATTEMPTS = 3;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Retry only transient failures (429/5xx/network) with short backoff. */
export async function sendWithRetry(
  send: () => Promise<SendResult>,
  sleepFn: (ms: number) => Promise<void> = sleep,
): Promise<{ result: SendResult; attempts: number }> {
  let attempts = 0;
  let result: SendResult = { ok: false, error: "not attempted", retryable: false };
  while (attempts < MAX_ATTEMPTS) {
    attempts++;
    result = await send();
    if (result.ok || !result.retryable) break;
    if (attempts < MAX_ATTEMPTS) await sleepFn(300 * 3 ** (attempts - 1));
  }
  return { result, attempts };
}

/**
 * Send one event to one user, at most once per (event, entityId, periodKey).
 * `entityId` must be a uuid (bill id, notification id, ticket id…).
 */
export async function sendWhatsAppNotification(input: {
  userId: string;
  event: WhatsAppEventType;
  entityId: string;
  periodKey: string;
  params: [string, string];
}): Promise<DispatchOutcome> {
  const job = `whatsapp:${input.event}`;
  let slotClaimed = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let admin: any;
  try {
    ({ supabaseAdmin: admin } = await import("@/integrations/supabase/client.server"));

    const { data: link, error: linkErr } = await admin
      .from("whatsapp_links")
      .select("phone_e164, verified, opted_in")
      .eq("user_id", input.userId)
      .maybeSingle();
    if (linkErr) throw new Error(`link lookup: ${linkErr.message}`);
    if (!link) return { status: "skipped", reason: "no_link" };
    if (!link.verified) return { status: "skipped", reason: "not_verified" };
    if (!link.opted_in) return { status: "skipped", reason: "not_opted_in" };

    const { data: claimed, error: claimErr } = await admin.rpc("claim_automation_slot", {
      _job: job,
      _entity_id: input.entityId,
      _period_key: input.periodKey,
      _entity_type: "whatsapp",
    });
    if (claimErr) throw new Error(`claim slot: ${claimErr.message}`);
    if (!claimed) return { status: "skipped", reason: "duplicate" };
    slotClaimed = true;

    const template = templateFor(input.event);
    const { result, attempts } = await sendWithRetry(() =>
      sendTemplateMessage(link.phone_e164, template, input.params),
    );

    const { error: logErr } = await admin.from("whatsapp_messages").insert({
      user_id: input.userId,
      direction: "outbound",
      event_type: input.event,
      template,
      provider_message_id: result.ok ? result.id : null,
      status: result.ok ? (result.mocked ? "mocked" : "sent") : "failed",
      failure_reason: result.ok ? null : result.error,
      attempts,
    });
    if (logErr) console.error("[whatsapp] message log insert failed:", logErr.message);

    await admin.rpc("finish_automation_slot", {
      _job: job,
      _entity_id: input.entityId,
      _period_key: input.periodKey,
      _status: result.ok ? "completed" : "failed",
      _error: result.ok ? null : result.error,
      _detail: { attempts },
    });

    return result.ok
      ? { status: result.mocked ? "mocked" : "sent", messageId: result.id }
      : { status: "failed", reason: result.error };
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown error";
    console.error(`[whatsapp] ${job} pipeline error:`, reason);
    if (slotClaimed && admin) {
      try {
        await admin.rpc("finish_automation_slot", {
          _job: job,
          _entity_id: input.entityId,
          _period_key: input.periodKey,
          _status: "failed",
          _error: reason.slice(0, 300),
          _detail: {},
        });
      } catch {
        /* best effort */
      }
    }
    return { status: "failed", reason };
  }
}
