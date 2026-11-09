import * as Device from "expo-device";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { api } from "./api";

/** Expo Go has no push support (and its notifications native module is missing), so never even load it there. */
export const inExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

async function notifications() {
  if (inExpoGo) return null;
  try {
    const N = await import("expo-notifications");
    N.setNotificationHandler({
      handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
    });
    return N;
  } catch {
    return null;
  }
}

/** Asks permission and registers this phone for push. Silent no-op in Expo Go / emulators / when denied. */
export async function registerForPush(): Promise<void> {
  try {
    if (!Device.isDevice) return;
    const N = await notifications();
    if (!N) return;
    if (Platform.OS === "android") {
      await N.setNotificationChannelAsync("default", { name: "Rentalos", importance: N.AndroidImportance.HIGH });
    }
    let { status } = await N.getPermissionsAsync();
    if (status !== "granted") status = (await N.requestPermissionsAsync()).status;
    if (status !== "granted") return;
    const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
    const token = (await N.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
    await api("push-token", { token, platform: Platform.OS === "ios" ? "ios" : "android" });
  } catch {
    /* push is optional */
  }
}

/** Calls `onLink` when the user taps a push notification. Returns an unsubscribe function. */
export function listenForNotificationTaps(onLink: (link: string | undefined) => void): () => void {
  let remove: (() => void) | null = null;
  let cancelled = false;
  void notifications().then((N) => {
    if (!N || cancelled) return;
    const sub = N.addNotificationResponseReceivedListener((r) => {
      onLink((r.notification.request.content.data as { link?: string } | undefined)?.link);
    });
    remove = () => sub.remove();
  });
  return () => {
    cancelled = true;
    remove?.();
  };
}
