import { describe, it, expect } from "vitest";
import { buildMessages, deadTokens, isExpoToken, categoryForKind, inQuietHours, pushDecision, DEFAULT_PREFS } from "../push";

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

describe("notification settings", () => {
  it("maps kinds to categories", () => {
    expect(categoryForKind("bill_due_soon")).toBe("rent");
    expect(categoryForKind("payment_approved")).toBe("rent");
    expect(categoryForKind("meter_decided")).toBe("rent");
    expect(categoryForKind("booking_new")).toBe("bookings");
    expect(categoryForKind("maintenance_update")).toBe("maintenance");
    expect(categoryForKind("roommate_chat")).toBe("roommate");
    expect(categoryForKind("tenant_doc_reviewed")).toBe("account");
    expect(categoryForKind("something_new")).toBe("account");
  });
  it("quiet hours handle the overnight window in the user's timezone (IST = +330)", () => {
    const p = { quiet_start: 22, quiet_end: 7, tz_offset_min: 330 };
    // 18:00 UTC = 23:30 IST → quiet; 02:00 UTC = 07:30 IST → not quiet; 20:00 UTC = 01:30 IST → quiet
    expect(inQuietHours(p, new Date("2026-10-18T18:00:00Z"))).toBe(true);
    expect(inQuietHours(p, new Date("2026-10-18T02:00:00Z"))).toBe(false);
    expect(inQuietHours(p, new Date("2026-10-18T20:00:00Z"))).toBe(true);
    expect(inQuietHours({ ...p, quiet_start: null }, new Date("2026-10-18T18:00:00Z"))).toBe(false);
    expect(inQuietHours({ quiet_start: 9, quiet_end: 17, tz_offset_min: 0 }, new Date("2026-10-18T12:00:00Z"))).toBe(true);
  });
  it("decides send / skip / defer", () => {
    const noon = new Date("2026-10-18T06:30:00Z");
    expect(pushDecision(DEFAULT_PREFS, "bill_new", noon)).toBe("send");
    expect(pushDecision({ ...DEFAULT_PREFS, push_enabled: false }, "bill_new", noon)).toBe("skip");
    expect(pushDecision({ ...DEFAULT_PREFS, rent: false }, "bill_new", noon)).toBe("skip");
    expect(pushDecision({ ...DEFAULT_PREFS, rent: false }, "roommate_chat", noon)).toBe("send");
    expect(pushDecision({ ...DEFAULT_PREFS, quiet_start: 11, quiet_end: 14 }, "bill_new", noon)).toBe("defer");
  });
});
