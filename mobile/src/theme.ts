import { useColorScheme } from "react-native";

const light = {
  bg: "#f6faf7", card: "#ffffff", text: "#12261b", muted: "#5b6b62", border: "#dbe7df",
  primary: "#1f9d55", onPrimary: "#ffffff", soft: "#e3f4ea", danger: "#d23c3c", warn: "#c27a10",
};
const dark: typeof light = {
  bg: "#0d1511", card: "#16211b", text: "#eaf3ed", muted: "#93a69a", border: "#243329",
  primary: "#34c06f", onPrimary: "#06210f", soft: "#18382a", danger: "#f06a6a", warn: "#e6a23c",
};
export type Colors = typeof light;
export const useColors = (): Colors => (useColorScheme() === "dark" ? dark : light);
export const R = { s: 8, m: 14, l: 20 };
export const inr = (n: number | null | undefined) => "₹" + Math.round(n ?? 0).toLocaleString("en-IN");
