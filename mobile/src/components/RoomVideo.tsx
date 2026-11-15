import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, AppState, Image, Pressable, View } from "react-native";
import { useEvent } from "expo";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView } from "expo-video";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { useColors } from "@/theme";
import { api } from "@/lib/api";

type Assets = { url: string | null; previewUrl: string | null; posterUrl: string | null };

export function RoomVideo({
  url,
  preview = false,
  active = true,
  onRefresh,
}: {
  url: string;
  preview?: boolean;
  active?: boolean;
  onRefresh?: () => Promise<string | null>;
}) {
  const c = useColors();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState(false);
  const player = useVideoPlayer(url, (p) => {
    p.loop = preview;
    p.muted = preview;
  });
  const { status } = useEvent(player, "statusChange", { status: player.status });
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => {
        setFocused(false);
        player.pause();
      };
    }, [player]),
  );
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => setForeground(state === "active"));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !focused || !foreground) player.pause();
    else if (preview && status === "readyToPlay") player.play();
  }, [active, focused, foreground, player, preview, status]);
  const failed = status === "error" || retryError;
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    setRetryError(false);
    try {
      const fresh = onRefresh ? await onRefresh() : url;
      if (!fresh) throw new Error();
      await player.replaceAsync(fresh);
    } catch {
      setRetryError(true);
    } finally {
      setRetrying(false);
    }
  };
  return (
    <View style={{ gap: 6 }}>
      {!preview && <Text style={{ color: c.text, fontWeight: "700" }}>Verified room video</Text>}
      <View
        style={{
          height: preview ? 170 : 260,
          overflow: "hidden",
          borderRadius: preview ? 0 : 14,
          backgroundColor: "#000",
        }}
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          nativeControls={!preview}
          contentFit={preview ? "cover" : "contain"}
          surfaceType="textureView"
          fullscreenOptions={{ enable: !preview }}
        />
        {(status === "loading" || retrying) && (
          <ActivityIndicator
            accessibilityLabel="Loading video"
            color="#fff"
            style={{ position: "absolute", top: "45%", alignSelf: "center" }}
          />
        )}
        {failed && !retrying && (
          <View
            style={{
              position: "absolute",
              inset: 0,
              backgroundColor: "#000b",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
          >
            <Text style={{ color: "#fff" }}>Video could not load.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={(e) => {
                e.stopPropagation();
                void retry();
              }}
              style={{ padding: 12 }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>
    </View>
  );
}

export function RoomVideoCover({
  roomId,
  active,
  fallback,
}: {
  roomId: string;
  active: boolean;
  fallback: string | null;
}) {
  const c = useColors();
  const q = useQuery({
    queryKey: ["room-video", roomId],
    queryFn: () => api<Assets>("room/video", { room_id: roomId }),
    enabled: active,
    staleTime: 60000,
  });
  if (q.data?.previewUrl)
    return (
      <RoomVideo
        url={q.data.previewUrl}
        preview
        active={active}
        onRefresh={async () => (await q.refetch({ throwOnError: true })).data?.previewUrl ?? null}
      />
    );
  const image = q.data?.posterUrl || fallback;
  return image ? (
    <Image
      source={{ uri: image }}
      style={{ height: 170, width: "100%", backgroundColor: c.soft }}
    />
  ) : (
    <View
      style={{
        height: 170,
        backgroundColor: c.soft,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: c.muted }}>Video coming soon</Text>
    </View>
  );
}
