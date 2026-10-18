import { createAudioPlayer } from "expo-audio";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "rentalos_vibe_muted";
let player: ReturnType<typeof createAudioPlayer> | null = null;

export const isVibeMuted = async () => (await AsyncStorage.getItem(KEY)) === "1";
export const setVibeMuted = async (m: boolean) => {
  await AsyncStorage.setItem(KEY, m ? "1" : "0");
  if (m) stopVibe();
};
export function stopVibe() {
  try { player?.pause(); player?.remove(); } catch { /* ignore */ }
  player = null;
}
/** Plays the welcome tone once (call on app open). No-op when muted. */
export async function playVibe(force = false) {
  try {
    if (!force && (await isVibeMuted())) return;
    stopVibe();
    player = createAudioPlayer(require("../../assets/vibe.wav"));
    player.volume = 0.8;
    player.play();
  } catch { /* audio unavailable */ }
}
