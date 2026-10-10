/**
 * Thin client for the OFFICIAL Meta WhatsApp Cloud API (Graph API).
 * Server-side only. Never import from client code.
 *
 * Mock mode: when META_WHATSAPP_ACCESS_TOKEN or META_WHATSAPP_PHONE_NUMBER_ID
 * is missing, nothing leaves the server — we log and return a mock id.
 * This is NOT live connectivity.
 *
 * Errors never throw: callers get { ok:false, error, retryable }.
 */

export type SendResult =
  { ok: true; id: string; mocked: boolean } | { ok: false; error: string; retryable: boolean };

const REQUEST_TIMEOUT_MS = 10_000;

export function isMetaConfigured(): boolean {
  return Boolean(
    process.env.META_WHATSAPP_ACCESS_TOKEN && process.env.META_WHATSAPP_PHONE_NUMBER_ID,
  );
}

/** Digits only, as the Cloud API expects (no "+"). Returns null if not plausible. */
export function toMetaPhone(e164: string): string | null {
  const digits = (e164 ?? "").replace(/[^\d]/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

async function post(payload: Record<string, unknown>, label: string): Promise<SendResult> {
  if (!isMetaConfigured()) {
    console.info(
      `[WHATSAPP MOCK MODE] ${label} (no message sent — Meta credentials not configured)`,
    );
    return { ok: true, id: `mock_${crypto.randomUUID()}`, mocked: true };
  }
  const version = process.env.META_GRAPH_API_VERSION || "v21.0";
  const url = `https://graph.facebook.com/${version}/${process.env.META_WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.META_WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string; code?: number };
    };
    if (!res.ok || !json.messages?.[0]?.id) {
      const msg = json.error?.message ?? `HTTP ${res.status}`;
      console.error(`[whatsapp] ${label} failed: ${msg}`);
      // 429 / 5xx are worth retrying; 4xx (bad template, bad number) are not.
      return {
        ok: false,
        error: msg.slice(0, 300),
        retryable: res.status === 429 || res.status >= 500,
      };
    }
    return { ok: true, id: json.messages[0].id, mocked: false };
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.name === "AbortError"
          ? "Request timed out"
          : e.message
        : "Network error";
    console.error(`[whatsapp] ${label} network error: ${msg}`);
    return { ok: false, error: msg.slice(0, 300), retryable: true };
  } finally {
    clearTimeout(timer);
  }
}

export async function sendTemplateMessage(
  toE164: string,
  template: string,
  params: string[] = [],
  language = "en",
): Promise<SendResult> {
  const to = toMetaPhone(toE164);
  if (!to) return { ok: false, error: "Invalid phone number", retryable: false };
  return post(
    {
      to,
      type: "template",
      template: {
        name: template,
        language: { code: language },
        components: params.length
          ? [
              {
                type: "body",
                parameters: params.map((p) => ({ type: "text", text: String(p).slice(0, 1000) })),
              },
            ]
          : [],
      },
    },
    `template:${template}`,
  );
}

/** Free-form text — only deliverable inside the 24h customer-service window. */
export async function sendTextMessage(toE164: string, body: string): Promise<SendResult> {
  const to = toMetaPhone(toE164);
  if (!to) return { ok: false, error: "Invalid phone number", retryable: false };
  return post(
    { to, type: "text", text: { body: body.slice(0, 4000), preview_url: false } },
    "text",
  );
}
