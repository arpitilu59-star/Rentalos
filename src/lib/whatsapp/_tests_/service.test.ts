import { describe, it, expect, vi } from "vitest";
import { sendWithRetry } from "../service";
import { eventForNotificationKind, templateFor } from "../templates";

describe("sendWithRetry", () => {
  it("retries transient failures then succeeds", async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, error: "503", retryable: true })
      .mockResolvedValueOnce({ ok: true, id: "1", mocked: false });
    const { result, attempts } = await sendWithRetry(send, async () => {});
    expect(result.ok).toBe(true);
    expect(attempts).toBe(2);
  });
  it("does not retry permanent failures", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: "bad", retryable: false });
    expect((await sendWithRetry(send, async () => {})).attempts).toBe(1);
  });
  it("gives up after 3 attempts", async () => {
    const send = vi.fn().mockResolvedValue({ ok: false, error: "x", retryable: true });
    expect((await sendWithRetry(send, async () => {})).attempts).toBe(3);
  });
});
describe("templates", () => {
  it("maps notification kinds; unknown kinds stay in-app", () => {
    expect(eventForNotificationKind("bill_due_soon")).toBe("rent_due_soon");
    expect(eventForNotificationKind("live_feed_uploaded")).toBeNull();
  });
  it("env override works", () => {
    process.env.META_TEMPLATE_RENT_OVERDUE = "custom";
    expect(templateFor("rent_overdue")).toBe("custom");
    delete process.env.META_TEMPLATE_RENT_OVERDUE;
  });
});
