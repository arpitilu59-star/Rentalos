import { describe, it, expect } from "vitest";
import { detectIntent } from "../intents";

describe("detectIntent", () => {
  it.each([
    ["when is rent due", "GET_RENT_DUE_DATE"],
    ["what is my rent", "GET_CURRENT_RENT"],
    ["payment status", "GET_PAYMENT_STATUS"],
    ["maintenance status", "GET_MAINTENANCE_STATUS"],
    ["dashboard link", "OPEN_DASHBOARD"],
    ["help", "HELP"],
    ["pay my rent", "UNKNOWN"],
    ["", "UNKNOWN"],
    ["blah blah", "UNKNOWN"],
  ])("%s -> %s", (t, i) => expect(detectIntent(t)).toBe(i));
});

import { eventForNotificationKind } from "../templates";
describe("eventForNotificationKind", () => {
  it("maps uppercase cron kinds and subscription kinds", () => {
    expect(eventForNotificationKind("RENT_DUE")).toBe("rent_due_soon");
    expect(eventForNotificationKind("RENT_OVERDUE")).toBe("rent_overdue");
    expect(eventForNotificationKind("LEASE_EXPIRING")).toBe("lease_expiring");
    expect(eventForNotificationKind("subscription_payment_approved")).toBe("subscription_update");
    expect(eventForNotificationKind("subscription_discount_applied")).toBeNull();
    expect(eventForNotificationKind("something_else")).toBeNull();
  });
});
