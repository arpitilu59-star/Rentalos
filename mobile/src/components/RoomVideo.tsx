import React from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { useVideoPlayer, VideoView } from "expo-video";
import { useColors } from "@/theme";

export function RoomVideo({ url }: { url: string }) {
  const c = useColors();
  const player = useVideoPlayer(url, (p) => { p.loop = false; });
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontWeight: "700" }}>Live video (owner ne abhi record ki)</Text>
      <VideoView player={player} style={{ width: "100%", height: 220, borderRadius: 14, backgroundColor: "#000" }} nativeControls contentFit="contain" />
    </View>
  );
}
