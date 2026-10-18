import { describe, it, expect } from "vitest";
import { buildMessages, deadTokens, isExpoToken } from "../push";

const T1 = "ExponentPushToken[abcdefghijklmnop]";
const T2 = "ExpoPushToken[zzzzzzzzzzzzzzzz]";
describe("push helpers", () => {
  it("validates expo tokens", () => {
    expect(isExpoToken(T1)).toBe(true);
    expect(isExpoToken("not-a-token")).toBe(false);
  });
  it("builds one message per valid device and skips bad tokens", () => {
    const n = [{ id: "n1", user_id: "u1", kind: "roommate_chat", title: "Hi", body: "hello", link: "/myr/roommate-chat" }];
    const m = buildMessages(n, new Map([["u1", [T1, T2, "junk"]]]));
    expect(m).toHaveLength(2);
    expect(m[0].data.link).toBe("/myr/roommate-chat");
    expect(buildMessages(n, new Map())).toHaveLength(0);
  });
  it("finds dead tokens from Expo tickets", () => {
    const msgs = buildMessages([{ id: "n", user_id: "u", kind: "k", title: "t", body: null, link: null }], new Map([["u", [T1, T2]]]));
    expect(deadTokens(msgs, [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }])).toEqual([T2]);
  });
});
