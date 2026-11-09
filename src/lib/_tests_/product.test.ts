import { describe, expect, it, vi } from "vitest";

vi.mock("../whatsapp/db", () => ({ getAdmin: vi.fn() }));
import { parseFeedback, sanitizeProps } from "../product.server";

describe("sanitizeProps", () => {
  it("keeps short scalars and drops free text / bad keys", () => {
    expect(sanitizeProps({ kind: "bug", n: 3, ok: true, email: "a b@c.com", "Bad Key": "x" })).toEqual({ kind: "bug", n: 3, ok: true });
  });
  it("handles non-objects", () => {
    expect(sanitizeProps(null)).toEqual({});
    expect(sanitizeProps("x")).toEqual({});
  });
});

describe("parseFeedback", () => {
  it("rejects empty text", () => {
    expect(() => parseFeedback({ kind: "bug", body: " " }, "landlord")).toThrow();
  });
  it("normalises kind/platform and trims", () => {
    const f = parseFeedback({ kind: "weird", body: "  app crash  ", platform: "ios" }, "tenant");
    expect(f).toMatchObject({ kind: "other", body: "app crash", platform: "ios", role: "tenant" });
  });
});
