import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validateNewPassword,
  friendlyResetError,
  RECOVERY_REDIRECT_SCRIPT,
} from "@/lib/password-reset";

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

describe("RECOVERY_REDIRECT_SCRIPT", () => {
  const run = (pathname: string, hash: string) => {
    const loc = { pathname, hash, replace: (u: string) => ((loc as { out?: string }).out = u) } as {
      pathname: string;
      hash: string;
      replace: (u: string) => void;
      out?: string;
    };
    new Function("window", RECOVERY_REDIRECT_SCRIPT)({ location: loc });
    return loc.out;
  };
  it("forwards a recovery token landing on the homepage, keeping the hash", () => {
    expect(run("/", "#access_token=a&refresh_token=b&type=recovery")).toBe(
      "/reset-password#access_token=a&refresh_token=b&type=recovery",
    );
  });
  it("forwards an expired-link error", () => {
    expect(run("/", "#error=access_denied&error_code=otp_expired")).toBe(
      "/reset-password#error=access_denied&error_code=otp_expired",
    );
  });
  it("leaves other pages and non-recovery hashes alone", () => {
    expect(run("/", "")).toBeUndefined();
    expect(run("/", "#access_token=a&type=signup")).toBeUndefined();
    expect(run("/reset-password", "#access_token=a&type=recovery")).toBeUndefined();
  });
});
