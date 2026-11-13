import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  cleanParam,
  sendTemplateMessage,
  sendTextMessage,
  toMetaPhone,
  isMetaConfigured,
  sendVerificationCode,
} from "../meta-client";

const KEYS = ["META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID", "META_WHATSAPP_AUTH_TEMPLATE", "META_TEMPLATE_LANGUAGE", "META_GRAPH_API_VERSION"] as const;
beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
afterEach(() => { KEYS.forEach((k) => delete process.env[k]); vi.restoreAllMocks(); });

describe("meta-client", () => {
  it("mock mode: no fetch, returns mock id", async () => {
    const f = vi.spyOn(globalThis, "fetch");
    expect(isMetaConfigured()).toBe(false);
    const r = await sendTemplateMessage("+919876543210", "t", ["a", "b"]);
    expect(r).toMatchObject({ ok: true, mocked: true });
    expect(f).not.toHaveBeenCalled();
  });
  it("rejects invalid numbers without throwing", async () => {
    expect(await sendTextMessage("abc", "hi")).toMatchObject({ ok: false, retryable: false });
    expect(toMetaPhone("+91 98765-43210")).toBe("919876543210");
  });
  it("live: success returns provider id", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "x";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "1";
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }),
    );
    expect(await sendTextMessage("+919876543210", "hi")).toEqual({
      ok: true,
      id: "wamid.1",
      mocked: false,
    });
  });
  it("live: 4xx not retryable, 5xx/network retryable, never throws", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "x";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "1";
    const f = vi.spyOn(globalThis, "fetch");
    f.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: "bad template" } }), { status: 400 }),
    );
    expect(await sendTextMessage("+919876543210", "x")).toMatchObject({
      ok: false,
      retryable: false,
      error: "bad template",
    });
    f.mockResolvedValueOnce(new Response("{}", { status: 503 }));
    expect(await sendTextMessage("+919876543210", "x")).toMatchObject({
      ok: false,
      retryable: true,
    });
    f.mockRejectedValueOnce(new Error("boom"));
    expect(await sendTextMessage("+919876543210", "x")).toMatchObject({
      ok: false,
      retryable: true,
      error: "boom",
    });
  });
  it("uses the approved template language and supported API version", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.META_TEMPLATE_LANGUAGE = "hi";
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.test" }] })),
    );
    await sendTemplateMessage("+919876543210", "rentalos_new_bill", ["Bill ready", "Open Rentalos"]);
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v25.0/123/messages");
    expect(JSON.parse(String(request?.body)).template.language.code).toBe("hi");
  });
  it("sends verification using an authentication template with the copy-code button", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
    process.env.META_WHATSAPP_AUTH_TEMPLATE = "rentalos_verify_code";
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ messages: [{ id: "wamid.auth" }] })),
    );
    expect(await sendVerificationCode("+919876543210", "012345")).toMatchObject({ ok: true, mocked: false });
    const body = JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      type: "template",
      template: {
        name: "rentalos_verify_code",
        language: { code: "en_US" },
        components: [
          { type: "body", parameters: [{ type: "text", text: "012345" }] },
          { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "012345" }] },
        ],
      },
    });
  });
  it("never pretends a verification code was sent without an approved auth template", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "test-token";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "123";
    const fetcher = vi.spyOn(globalThis, "fetch");
    expect(await sendVerificationCode("+919876543210", "012345")).toMatchObject({ ok: false, retryable: false });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("cleanParam", () => {
  it("strips newlines/tabs/extra spaces and never returns empty", () => {
    expect(cleanParam("a\nb\t\tc    d")).toBe("a b c d");
    expect(cleanParam("   ")).toBe("-");
    expect(cleanParam(null)).toBe("-");
  });
});
