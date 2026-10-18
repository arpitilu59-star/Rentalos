import React from "react";
import { Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSaved } from "@/lib/saved";
import { useColors } from "@/theme";

export function Heart({ roomId, style }: { roomId: string; style?: object }) {
  const { isSaved, toggle } = useSaved();
  const c = useColors();
  const on = isSaved(roomId);
  return (
    <Pressable hitSlop={10} onPress={() => { void Haptics.selectionAsync(); toggle(roomId); }}
      style={[{ backgroundColor: "#0009", width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" }, style]}>
      <Ionicons name={on ? "heart" : "heart-outline"} size={20} color={on ? "#ff5a6e" : "#fff"} />
    </Pressable>
  );
}
