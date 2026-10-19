import React, { useEffect, useRef } from "react";
import { Animated, View } from "react-native";
import { useColors, R } from "@/theme";

/** Pulsing placeholder card shown while a list loads. */
export function SkeletonCard({ height = 150 }: { height?: number }) {
  const c = useColors();
  const o = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const a = Animated.loop(Animated.sequence([
      Animated.timing(o, { toValue: 1, duration: 700, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0.45, duration: 700, useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [o]);
  return (
    <Animated.View style={{ opacity: o, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, height, padding: 14, gap: 10 }}>
      <View style={{ backgroundColor: c.border, height: 14, width: "55%", borderRadius: 6 }} />
      <View style={{ backgroundColor: c.border, height: 10, width: "80%", borderRadius: 6 }} />
      <View style={{ backgroundColor: c.border, height: 10, width: "35%", borderRadius: 6 }} />
    </Animated.View>
  );
}

export function SkeletonList({ n = 4, height }: { n?: number; height?: number }) {
  return <View style={{ gap: 14 }}>{Array.from({ length: n }, (_, i) => <SkeletonCard key={i} height={height} />)}</View>;
}
