import { describe, it, expect } from "vitest";
import { canSend, maskContactDetails, videoRoomName, videoRoomUrl, cleanMessage } from "../roommate-chat";

describe("roommate chat rules", () => {
  it("only active threads accept messages", () => {
    expect(canSend("active").ok).toBe(true);
    for (const s of ["pending", "declined", "blocked"] as const) expect(canSend(s).ok).toBe(false);
  });
  it("hides phone numbers and emails", () => {
    expect(maskContactDetails("call me 98765 43210 or a.b@x.com")).toBe("call me [number hidden] or [email hidden]");
    expect(maskContactDetails("I pay 8000 rent")).toBe("I pay 8000 rent");
  });
  it("builds a private video room from the thread id", () => {
    const id = "123e4567-e89b-42d3-a456-426614174000";
    expect(videoRoomName(id)).toBe("rentalos-rm-123e4567e89b42d3a456426614174000");
    expect(videoRoomUrl(id)).toMatch(/^https:\/\/meet\.ffmuc\.net\/rentalos-rm-/);
  });
  it("trims and caps messages", () => {
    expect(cleanMessage("  hi\n\n\n\nthere ")).toBe("hi\n\nthere");
    expect(cleanMessage("x".repeat(3000))).toHaveLength(2000);
  });
});
