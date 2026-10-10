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
