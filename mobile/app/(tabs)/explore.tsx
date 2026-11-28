import React, { useEffect, useMemo, useState, useRef } from "react";
import { ActivityIndicator, AppState, FlatList, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "@/components/Text";
import { useInfiniteQuery } from "@tanstack/react-query";
import { SkeletonList } from "@/components/Skeleton";
import { useIsFocused, useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Card, Chip, Empty, ErrorText } from "@/components/ui";
import { useColors, inr, R } from "@/theme";
import * as Location from "expo-location";
import { useT } from "@/lib/i18n";
import { RoomVideoCover } from "@/components/RoomVideo";
import { Heart } from "@/components/Heart";

const km = (a: number, b: number, c: number, d: number) => {
  const t = (x: number) => (x * Math.PI) / 180;
  const h =
    Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
};

import { OCC, SIZES, cover, type RoomRow } from "@/lib/rooms";

export default function Explore() {
  const c = useColors();
  const t = useT();
  const router = useRouter();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => listener.remove();
  }, []);
  const [visibleRooms, setVisibleRooms] = useState<Set<string>>(new Set());
  const viewability = useRef({ itemVisiblePercentThreshold: 60, minimumViewTime: 180 }).current;
  const viewableChanged = useRef(
    ({ viewableItems }: { viewableItems: Array<{ item: RoomRow }> }) => {
      setVisibleRooms(new Set(viewableItems.map(({ item }) => item.id)));
    },
  ).current;
  const [city, setCity] = useState("");
  const [applied, setApplied] = useState("");
  const [occ, setOcc] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const nearMe = async () => {
    if (me) {
      setMe(null);
      return;
    }
    if (locating) return;
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (!perm.granted) {
        setLocErr("Location permission chahiye.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setLocErr(null);
      setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setLocErr("Location nahi mil paayi. GPS check karke dobara try karein.");
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => {
    const t = setTimeout(() => setApplied(city.trim()), 400);
    return () => clearTimeout(t);
  }, [city]);

  const PAGE = 20;
  const q = useInfiniteQuery({
    queryKey: ["rooms", applied, occ, size],
    initialPageParam: 0,
    getNextPageParam: (last: RoomRow[], all) =>
      last.length === PAGE ? all.length * PAGE : undefined,
    queryFn: async ({ pageParam, signal }) => {
      let s = supabase
        .from("rooms")
        .select(
          "id, room_number, rent_amount, occupant_type, room_size, myr_photos, properties!inner(name, myr_city, city, myr_cover_photos, verification_status, myr_lat, myr_lng, latitude, longitude)",
        )
        .eq("is_public", true)
        .eq("myr_available", true)
        .order("rent_amount", { ascending: true })
        .order("id")
        .range(pageParam, pageParam + PAGE - 1);
      if (applied) {
        const p = applied.replace(/[^A-Za-z0-9 ]/g, "");
        s = s.or(`myr_city.ilike.%${p}%,city.ilike.%${p}%`, { foreignTable: "properties" });
      }
      if (occ) s = s.in("occupant_type", [occ, "anyone"]);
      if (size) s = s.eq("room_size", size);
      const { data, error } = await s.abortSignal(signal);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RoomRow[];
    },
  });

  const { rooms, distances } = useMemo(() => {
    const rooms = q.data?.pages.flat() ?? [];
    const distances = new Map<string, number>();
    if (me) {
      for (const room of rooms) {
        const property = room.properties;
        const lat = property?.myr_lat ?? property?.latitude;
        const lng = property?.myr_lng ?? property?.longitude;
        if (lat != null && lng != null) distances.set(room.id, km(me.lat, me.lng, lat, lng));
      }
      rooms.sort((a, b) => (distances.get(a.id) ?? 1e9) - (distances.get(b.id) ?? 1e9));
    }
    return { rooms, distances };
  }, [q.data, me]);
  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6, gap: 10 }}>
        <TextInput
          value={city}
          onChangeText={setCity}
          placeholder="Search city or area (e.g. Jaipur)"
          placeholderTextColor={c.muted}
          style={{
            backgroundColor: c.card,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: R.m,
            padding: 12,
            color: c.text,
          }}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label={me ? "📍 Near me ✓" : "📍 Near me"} active={!!me} onPress={nearMe} />
          {OCC.map(([k, l]) => (
            <Chip
              key={k}
              label={l}
              active={occ === k}
              onPress={() => setOcc(occ === k ? null : k)}
            />
          ))}
          {SIZES.map(([k, l]) => (
            <Chip
              key={k}
              label={l}
              active={size === k}
              onPress={() => setSize(size === k ? null : k)}
            />
          ))}
        </ScrollView>
      </View>
      <ErrorText error={q.error ?? (locErr ? new Error(locErr) : null)} />
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        extraData={visibleRooms}
        viewabilityConfig={viewability}
        onViewableItemsChanged={viewableChanged}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        onEndReached={() => {
          if (q.hasNextPage && !q.isFetching) void q.fetchNextPage();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          q.isFetchingNextPage ? (
            <ActivityIndicator color={c.primary} style={{ padding: 16 }} />
          ) : null
        }
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList />
          ) : (
            <Empty text="Koi room nahi mila. Filter ya city badal kar dekhein." />
          )
        }
        renderItem={({ item: r }) => {
          const img = cover(r);
          const distance = distances.get(r.id);
          return (
            <Pressable
              onPress={() => router.push({ pathname: "/room/[id]", params: { id: r.id } })}
            >
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <View>
                  <RoomVideoCover
                    roomId={r.id}
                    active={focused && foreground && visibleRooms.has(r.id)}
                    fallback={img}
                  />
                  <Heart roomId={r.id} style={{ position: "absolute", right: 10, top: 10 }} />
                </View>
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text
                      style={{ color: c.text, fontWeight: "700", fontSize: 16, flex: 1 }}
                      numberOfLines={1}
                    >
                      {r.properties?.name} · Room {r.room_number}
                    </Text>
                    <Text style={{ color: c.primary, fontWeight: "800", fontSize: 16 }}>
                      {inr(r.rent_amount)}
                    </Text>
                  </View>
                  <Text style={{ color: c.muted, marginTop: 3 }}>
                    {r.properties?.myr_city || r.properties?.city}
                    {r.occupant_type
                      ? ` · ${t(OCC.find(([k]) => k === r.occupant_type)?.[1] ?? "Anyone")}`
                      : ""}
                    {r.room_size
                      ? ` · ${t(SIZES.find(([k]) => k === r.room_size)?.[1] ?? "")}`
                      : ""}
                  </Text>
                  {distance != null && (
                    <Text style={{ color: c.muted, marginTop: 4 }}>
                      📍 {distance.toFixed(1)} km door
                    </Text>
                  )}
                  {r.properties?.verification_status === "verified" && (
                    <Text
                      style={{ color: c.primary, marginTop: 6, fontWeight: "600", fontSize: 12 }}
                    >
                      ✔ Verified property
                    </Text>
                  )}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
