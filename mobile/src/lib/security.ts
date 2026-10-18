import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";

const KEY = "rentalos_biometric";
export const biometricAvailable = async () =>
  (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
export const getBiometricOn = async () => (await SecureStore.getItemAsync(KEY)) === "1";
export const setBiometricOn = (on: boolean) => SecureStore.setItemAsync(KEY, on ? "1" : "0");
export async function unlock(): Promise<boolean> {
  const r = await LocalAuthentication.authenticateAsync({ promptMessage: "Unlock Rentalos", cancelLabel: "Cancel" });
  return r.success;
}
