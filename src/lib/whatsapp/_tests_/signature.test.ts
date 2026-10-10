import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import { verifyMetaSignature } from "../signature";

const sign = (b: string, s: string) => "sha256=" + createHmac("sha256", s).update(b).digest("hex");
describe("verifyMetaSignature", () => {
  it("accepts valid, rejects tampered/missing/malformed", async () => {
    const body = '{"a":1}';
    expect(await verifyMetaSignature(body, sign(body, "s"), "s")).toBe(true);
    expect(await verifyMetaSignature(body + " ", sign(body, "s"), "s")).toBe(false);
    expect(await verifyMetaSignature(body, sign(body, "other"), "s")).toBe(false);
    expect(await verifyMetaSignature(body, null, "s")).toBe(false);
    expect(await verifyMetaSignature(body, "sha256=zz", "s")).toBe(false);
  });
});
