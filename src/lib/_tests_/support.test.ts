import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
const mock = vi.hoisted(() => ({
  send: vi.fn(),
  rpc: vi.fn(),
  previous: null as null | { requester_hash: string; status: string },
  inserts: [] as unknown[],
  updates: [] as unknown[],
}));
vi.mock("../whatsapp/db", () => ({
  getAdmin: async () => ({
    rpc: mock.rpc,
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mock.previous, error: null }) }),
      }),
      insert: async (v: unknown) => {
        mock.inserts.push(v);
        return { error: null };
      },
      update: (v: unknown) => ({
        eq: async () => {
          mock.updates.push(v);
          return { error: null };
        },
      }),
    }),
  }),
}));
vi.mock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail: mock.send }) } }));
import { handleSupportQuery } from "../support.server";
import { privateHash, readSmallJson, requestIp } from "../request-safety.server";
import { isBotAgent, visitorFromCookie } from "../room-insights.server";
const query = () => ({
  id: randomUUID(),
  name: "Test User",
  email: "visitor@example.com",
  phone: "",
  category: "technical",
  subject: "Room video question",
  message: "Please help me with this room video question.",
  website: "",
  consent: true,
});
const request = (body: unknown, origin = "https://www.rentalos.in") =>
  new Request("https://www.rentalos.in/api/support/query", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.stubEnv("REQUEST_HASH_SECRET", "test-only-secret");
  vi.stubEnv("SUPPORT_SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SUPPORT_SMTP_USER", "support@rentalos.in");
  vi.stubEnv("SUPPORT_SMTP_PASSWORD", "test-only");
  mock.previous = null;
  mock.inserts = [];
  mock.updates = [];
  mock.rpc.mockResolvedValue({ data: true, error: null });
  mock.send
    .mockReset()
    .mockResolvedValue({ accepted: ["support@rentalos.in"], messageId: "test-id" });
});
afterEach(() => vi.unstubAllEnvs());
describe("support delivery", () => {
  it("sends only to the support inbox and uses the visitor as reply-to", async () => {
    const q = query();
    const result = await handleSupportQuery(request({ ...q, to: "attacker@example.com" }));
    expect(result.status).toBe(200);
    expect(mock.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "support@rentalos.in",
        replyTo: q.email,
        from: { name: "RentalOS Support", address: "support@rentalos.in" },
      }),
    );
    expect(mock.updates).toContainEqual({ status: "accepted", provider_id: "test-id" });
  });
  it("rejects header injection, missing consent, honeypots and foreign origins before sending", async () => {
    for (const q of [
      { ...query(), subject: "Hello\r\nBcc: evil@example.com" },
      { ...query(), consent: false },
      { ...query(), website: "spam" },
    ])
      expect((await handleSupportQuery(request(q))).status).toBe(400);
    expect((await handleSupportQuery(request(query(), "https://unrelated.example"))).status).toBe(
      403,
    );
    expect(mock.send).not.toHaveBeenCalled();
  });
  it("rate-limits before persisting or sending", async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    expect((await handleSupportQuery(request(query()))).status).toBe(429);
    expect(mock.send).not.toHaveBeenCalled();
    expect(mock.inserts).toHaveLength(0);
  });
  it("never retries an ambiguous SMTP send and never claims a failed email was delivered", async () => {
    const q = query();
    mock.send.mockRejectedValue(new Error("timeout"));
    const response = await handleSupportQuery(request(q));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reference: q.id });
    mock.previous = { requester_hash: privateHash("support-email", q.email), status: "failed" };
    expect((await handleSupportQuery(request(q))).status).toBe(409);
    expect(mock.send).toHaveBeenCalledTimes(1);
  });
  it("acknowledges an already accepted query without sending it twice", async () => {
    const q = query();
    mock.previous = { requester_hash: privateHash("support-email", q.email), status: "accepted" };
    expect((await handleSupportQuery(request(q))).status).toBe(200);
    expect(mock.send).not.toHaveBeenCalled();
  });
});
describe("request and anonymous analytics safety", () => {
  it("rejects oversized bodies and ignores untrusted IP headers", async () => {
    await expect(readSmallJson(request({ message: "x".repeat(17000) }))).rejects.toThrow(
      /too large/,
    );
    vi.stubEnv("VERCEL", "");
    expect(
      requestIp(new Request("https://example.com", { headers: { "x-forwarded-for": "1.2.3.4" } })),
    ).toBe("local");
  });
  it("filters crawlers and rejects forged visitor cookies", () => {
    expect(isBotAgent("Googlebot/2.1")).toBe(true);
    expect(isBotAgent("okhttp/4.12.0")).toBe(false);
    const id = randomUUID();
    expect(visitorFromCookie(`${id}.${privateHash("visitor-cookie", id)}`)).toBe(id);
    expect(visitorFromCookie(`${id}.${"a".repeat(64)}`)).toBeNull();
  });
});
