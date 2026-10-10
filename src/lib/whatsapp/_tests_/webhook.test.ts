import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

const state = {
  inserts: [] as unknown[],
  dupe: false,
  link: { user_id: "u1", verified: true, opted_in: true } as unknown,
};
vi.mock("../db", () => ({
  getAdmin: async () => ({
    from: (t: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: t === "whatsapp_links" ? state.link : null,
            error: null,
          }),
        }),
        in: () => ({ eq: async () => ({ data: [], error: null }) }),
      }),
      insert: async (row: unknown) => {
        state.inserts.push(row);
        return { error: state.dupe ? { code: "23505", message: "dup" } : null };
      },
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
    }),
  }),
}));
const sendText = vi.fn(async () => ({ ok: true, id: "m", mocked: true }));
vi.mock("../meta-client", async (orig) => ({
  ...(await orig<typeof import("../meta-client")>()),
  sendTextMessage: (...a: unknown[]) => (sendText as never as (...x: unknown[]) => unknown)(...a),
}));

import { handleWebhookVerify, handleWebhookEvent } from "../webhook";

const payload = (msg: object) =>
  JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ value: { messages: [msg] } }] }],
  });
const req = (body: string, headers: Record<string, string> = {}) =>
  new Request("https://x/api/whatsapp/webhook", { method: "POST", body, headers });

beforeEach(() => {
  state.inserts = [];
  state.dupe = false;
  sendText.mockClear();
  delete process.env.META_APP_SECRET;
  delete process.env.META_WHATSAPP_ACCESS_TOKEN;
  delete process.env.META_WHATSAPP_PHONE_NUMBER_ID;
  process.env.META_WHATSAPP_VERIFY_TOKEN = "tok";
});

describe("verify", () => {
  const u = (q: string) => new URL("https://x/api/whatsapp/webhook?" + q);
  it("echoes challenge on match, 403 on mismatch, 500 when unset", async () => {
    const ok = handleWebhookVerify(u("hub.mode=subscribe&hub.verify_token=tok&hub.challenge=123"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("123");
    expect(
      handleWebhookVerify(u("hub.mode=subscribe&hub.verify_token=no&hub.challenge=1")).status,
    ).toBe(403);
    delete process.env.META_WHATSAPP_VERIFY_TOKEN;
    expect(
      handleWebhookVerify(u("hub.mode=subscribe&hub.verify_token=&hub.challenge=1")).status,
    ).toBe(500);
  });
});

describe("events", () => {
  it("malformed JSON and foreign objects -> 200 ignored", async () => {
    expect((await handleWebhookEvent(req("{nope"))).status).toBe(200);
    expect((await handleWebhookEvent(req('{"object":"page"}'))).status).toBe(200);
    expect(state.inserts).toHaveLength(0);
  });
  it("signature enforced when secret set", async () => {
    process.env.META_APP_SECRET = "s";
    const body = payload({ id: "w1", from: "919876543210", type: "text", text: { body: "help" } });
    expect((await handleWebhookEvent(req(body))).status).toBe(401);
    expect(
      (
        await handleWebhookEvent(
          req(body, {
            "x-hub-signature-256": "sha256=" + createHmac("sha256", "s").update(body).digest("hex"),
          }),
        )
      ).status,
    ).toBe(200);
    expect(sendText).toHaveBeenCalledTimes(1);
  });
  it("fails closed when live creds set but no app secret", async () => {
    process.env.META_WHATSAPP_ACCESS_TOKEN = "a";
    process.env.META_WHATSAPP_PHONE_NUMBER_ID = "1";
    expect(
      (await handleWebhookEvent(req(payload({ id: "w", from: "1", type: "text" })))).status,
    ).toBe(500);
  });
  it("duplicate delivery is replied to only once", async () => {
    state.dupe = true;
    await handleWebhookEvent(
      req(payload({ id: "w1", from: "919876543210", type: "text", text: { body: "help" } })),
    );
    expect(sendText).not.toHaveBeenCalled();
  });
  it("unsupported type gets a safe reply; unverified number gets nothing", async () => {
    await handleWebhookEvent(req(payload({ id: "w2", from: "919876543210", type: "image" })));
    expect(sendText).toHaveBeenCalledTimes(1);
    sendText.mockClear();
    state.link = { user_id: "u1", verified: false, opted_in: true };
    await handleWebhookEvent(
      req(payload({ id: "w3", from: "919876543210", type: "text", text: { body: "help" } })),
    );
    expect(sendText).not.toHaveBeenCalled();
    state.link = { user_id: "u1", verified: true, opted_in: true };
  });
  it("opted-out user: logged but no reply", async () => {
    state.link = { user_id: "u1", verified: true, opted_in: false };
    await handleWebhookEvent(
      req(payload({ id: "w4", from: "919876543210", type: "text", text: { body: "help" } })),
    );
    expect(state.inserts).toHaveLength(1);
    expect(sendText).not.toHaveBeenCalled();
    state.link = { user_id: "u1", verified: true, opted_in: true };
  });
});
