import { Platform } from "react-native";
import { api } from "./api";

/** Fire-and-forget product analytics (first-party). Never throws, never blocks the UI. */
export function track(event: string, props?: Record<string, string | number | boolean>): void {
  void api("track", { event, props, platform: Platform.OS }).catch(() => {});
}
