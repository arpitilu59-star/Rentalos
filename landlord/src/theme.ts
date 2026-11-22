import { useColorScheme } from "react-native";

const light = {
  bg: "#f7f9fb",
  card: "#ffffff",
  text: "#111b3d",
  muted: "#657087",
  border: "#e2e5eb",
  primary: "#111b3d",
  onPrimary: "#ffffff",
  soft: "#edf0f6",
  danger: "#d52f3b",
  warn: "#b96908",
  ok: "#008b69",
  gold: "#b4945b",
  goldLight: "#e7d4b0",
  hero: "#111b3d",
};
const dark: typeof light = {
  bg: "#0c1224",
  card: "#151e35",
  text: "#f3f5fa",
  muted: "#a6b1c8",
  border: "#2a3651",
  primary: "#e7d4b0",
  onPrimary: "#111b3d",
  soft: "#202e49",
  danger: "#ff7d88",
  warn: "#f6ba68",
  ok: "#4bd5ac",
  gold: "#d4b57e",
  goldLight: "#e7d4b0",
  hero: "#111b3d",
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === "dark" ? dark : light);
export const R = { s: 10, m: 16, l: 24 };
export const inr = (n: number | null | undefined) =>
  "₹" + Math.round(n ?? 0).toLocaleString("en-IN");
export const dmy = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
