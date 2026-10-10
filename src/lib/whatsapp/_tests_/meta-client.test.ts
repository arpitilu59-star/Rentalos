import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  sendTemplateMessage,
  sendTextMessage,
  toMetaPhone,
  isMetaConfigured,
} from "../meta-client";

const KEYS = ["META_WHATSAPP_ACCESS_TOKEN", "META_WHATSAPP_PHONE_NUMBER_ID"] as const;
beforeEach(() => KEYS.forEach((k) => delete process.env[k]));
afterEach(() => vi.restoreAllMocks());

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
});
