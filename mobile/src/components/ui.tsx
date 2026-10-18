import React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { useColors, R } from "@/theme";

export function Button({ title, onPress, busy, kind = "primary", disabled, style }: {
  title: string; onPress: () => void; busy?: boolean; kind?: "primary" | "ghost" | "danger"; disabled?: boolean; style?: ViewStyle;
}) {
  const c = useColors();
  const bg = kind === "primary" ? c.primary : kind === "danger" ? c.danger : "transparent";
  const fg = kind === "ghost" ? c.text : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      style={({ pressed }) => [
        { backgroundColor: bg, borderRadius: R.m, paddingVertical: 13, paddingHorizontal: 18, alignItems: "center", justifyContent: "center",
          borderWidth: kind === "ghost" ? 1 : 0, borderColor: c.border, opacity: disabled || busy ? 0.55 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: kind === "primary" ? c.onPrimary : fg, fontWeight: "700", fontSize: 15 }}>{title}</Text>}
    </Pressable>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: R.l, borderWidth: 1, borderColor: c.border, padding: 16 }, style]}>{children}</View>;
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 99, marginRight: 8,
      backgroundColor: active ? c.primary : c.card, borderWidth: 1, borderColor: active ? c.primary : c.border }}>
      <Text style={{ color: active ? c.onPrimary : c.text, fontSize: 13, fontWeight: "600" }}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  const c = useColors();
  return <Text style={{ color: c.muted, textAlign: "center", padding: 28, fontSize: 14 }}>{text}</Text>;
}

export function ErrorText({ error }: { error: unknown }) {
  const c = useColors();
  if (!error) return null;
  return <Text style={{ color: c.danger, fontSize: 13, marginVertical: 6 }}>{error instanceof Error ? error.message : String(error)}</Text>;
}

export const screen = StyleSheet.create({ pad: { padding: 16, gap: 12 } });
