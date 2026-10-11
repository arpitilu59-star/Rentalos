import { describe, it, expect } from "vitest";
import { validateEmail, validateNewPassword, friendlyResetError } from "@/lib/password-reset";

describe("password reset helpers", () => {
  it("validates email", () => {
    expect(validateEmail("")).toMatch(/Enter your email/);
    expect(validateEmail("abc")).toMatch(/valid/);
    expect(validateEmail(" a@b.co ")).toBeNull();
  });
  it("validates new password", () => {
    expect(validateNewPassword("short1", "short1")).toMatch(/at least 8/);
    expect(validateNewPassword("onlyletters", "onlyletters")).toMatch(/letter and one number/);
    expect(validateNewPassword("abcdefg1", "abcdefg2")).toMatch(/match/);
    expect(validateNewPassword("abcdefg1", "abcdefg1")).toBeNull();
  });
  it("maps errors without leaking account existence", () => {
    expect(friendlyResetError("email rate limit exceeded")).toMatch(/Too many/);
    expect(friendlyResetError("New password should be different from the old password.")).toMatch(
      /different/,
    );
    expect(friendlyResetError("Auth session missing!")).toMatch(/invalid or has expired/);
    expect(friendlyResetError(undefined)).toMatch(/Something went wrong/);
  });
});
