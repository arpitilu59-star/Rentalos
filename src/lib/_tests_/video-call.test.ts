import { describe, it, expect, afterEach } from "vitest";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { callUrlFor, jaasToken } from "../video-call.server";

const T = "11111111-2222-3333-4444-555555555555";
const keys = generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
afterEach(() => { delete process.env.JAAS_APP_ID; delete process.env.JAAS_KEY_ID; delete process.env.JAAS_PRIVATE_KEY; delete process.env.VIDEO_DOMAIN; });

describe("call url", () => {
  it("uses a no-login public server by default, never meet.jit.si", () => {
    const u = callUrlFor(T, "u1", "Arpit");
    expect(u).toMatch(/^https:\/\/meet\.ffmuc\.net\/rentalos-rm-/);
    expect(u).not.toContain("meet.jit.si");
  });
  it("VIDEO_DOMAIN overrides the server", () => {
    process.env.VIDEO_DOMAIN = "jitsi.example.org";
    expect(callUrlFor(T, "u1", "A")).toMatch(/^https:\/\/jitsi\.example\.org\//);
  });
  it("with JaaS keys it returns a moderator token that verifies", () => {
    process.env.JAAS_APP_ID = "vpaas-magic-cookie-abc"; process.env.JAAS_KEY_ID = "k1"; process.env.JAAS_PRIVATE_KEY = keys.privateKey.replace(/\n/g, "\\n");
    const u = callUrlFor(T, "u1", "Arpit");
    expect(u).toMatch(/^https:\/\/8x8\.vc\/vpaas-magic-cookie-abc\/rentalos-rm-/);
    const jwt = new URL(u).searchParams.get("jwt")!;
    const [h, b, s] = jwt.split(".");
    expect(createVerify("RSA-SHA256").update(`${h}.${b}`).verify(keys.publicKey, Buffer.from(s, "base64url"))).toBe(true);
    const head = JSON.parse(Buffer.from(h, "base64url").toString()); const body = JSON.parse(Buffer.from(b, "base64url").toString());
    expect(head.kid).toBe("vpaas-magic-cookie-abc/k1");
    expect(body.context.user.moderator).toBe("true"); expect(body.sub).toBe("vpaas-magic-cookie-abc");
  });
  it("jaasToken keeps a full kid as given", () => {
    const j = jaasToken({ appId: "a", keyId: "a/x", privateKey: keys.privateKey, room: "r", userId: "u", name: "n" });
    expect(JSON.parse(Buffer.from(j.split(".")[0], "base64url").toString()).kid).toBe("a/x");
  });
});
