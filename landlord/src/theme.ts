import { useColorScheme } from "react-native";

const light = {
  bg: "#f5f7fd",
  card: "#ffffff",
  text: "#141a33",
  muted: "#5d6585",
  border: "#dde2f2",
  primary: "#2f4fd8",
  onPrimary: "#ffffff",
  soft: "#e6ebfc",
  danger: "#d23c3c",
  warn: "#c27a10",
  ok: "#1f9d55",
};
const dark: typeof light = {
  bg: "#0d1020",
  card: "#171b33",
  text: "#eceffc",
  muted: "#97a0c4",
  border: "#272c4d",
  primary: "#6f8bff",
  onPrimary: "#0a0f2a",
  soft: "#1d2547",
  danger: "#f06a6a",
  warn: "#e6a23c",
  ok: "#34c06f",
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === "dark" ? dark : light);
export const R = { s: 8, m: 14, l: 20 };
export const inr = (n: number | null | undefined) =>
  "₹" + Math.round(n ?? 0).toLocaleString("en-IN");
export const dmy = (s: string | null | undefined) =>
  s
    ? new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "—";
