import { useColorScheme } from "react-native";

const light = {
  bg: "#fffaf8",
  card: "#ffffff",
  text: "#33212a",
  muted: "#716069",
  border: "#e7dce0",
  primary: "#70233b",
  onPrimary: "#ffffff",
  soft: "#faecee",
  danger: "#d52f3b",
  warn: "#b96908",
  ok: "#008b69",
  gold: "#ba840c",
  goldLight: "#ffdc72",
  hero: "#70233b",
};
const dark: typeof light = {
  bg: "#20151a",
  card: "#302128",
  text: "#fff7f9",
  muted: "#cebfc5",
  border: "#523b46",
  primary: "#ffdc72",
  onPrimary: "#70233b",
  soft: "#412c36",
  danger: "#ff7d88",
  warn: "#f6ba68",
  ok: "#4bd5ac",
  gold: "#f4c64d",
  goldLight: "#ffdc72",
  hero: "#70233b",
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === "dark" ? dark : light);
export const R = { s: 10, m: 16, l: 24 };
export const inr = (n: number | null | undefined) =>
  "₹" + Math.round(n ?? 0).toLocaleString("en-IN");
