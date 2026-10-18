import React, { useState } from "react";
import { FlatList, Image, Pressable, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { Text } from "@/components/Text";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Heart } from "@/components/Heart";
import { OCC, SIZES, cover, type RoomRow } from "./(tabs)/explore";
import { useColors, inr } from "@/theme";

type Saved = RoomRow & { myr_deposit: number | null; myr_amenities: unknown; myr_available: boolean };

export default function SavedRooms() {
  const c = useColors();
  const t = useT();
  const router = useRouter();
  const [pick, setPick] = useState<string[]>([]);
  const [cmp, setCmp] = useState(false);
  const q = useQuery({
    queryKey: ["saved-rooms"],
    queryFn: async () => {
      const { data: ids, error: e1 } = await supabase.from("app_saved_rooms").select("room_id").order("created_at", { ascending: false });
      if (e1) throw new Error(e1.message);
      const list = (ids ?? []).map((r: { room_id: string }) => r.room_id);
      if (!list.length) return [] as Saved[];
      const { data, error } = await supabase.from("rooms")
        .select("id, room_number, rent_amount, occupant_type, room_size, myr_photos, myr_deposit, myr_amenities, myr_available, properties(name, myr_city, city, myr_cover_photos, verification_status)")
        .in("id", list);
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Saved[];
    },
  });
  const rooms = q.data ?? [];
  const chosen = rooms.filter((r) => pick.includes(r.id));
  const arr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

  if (cmp && chosen.length >= 2) {
    const rows: Array<[string, (r: Saved) => string]> = [
      ["Rent", (r) => inr(r.rent_amount)], ["Deposit", (r) => (r.myr_deposit != null ? inr(r.myr_deposit) : "—")],
      ["City", (r) => r.properties?.myr_city || r.properties?.city || "—"],
      ["For", (r) => OCC.find(([k]) => k === r.occupant_type)?.[1] ?? "Anyone"], ["Size", (r) => SIZES.find(([k]) => k === r.room_size)?.[1] ?? "—"],
      ["Verified", (r) => (r.properties?.verification_status === "verified" ? "Yes ✔" : "No")],
      ["Available", (r) => (r.myr_available ? "Yes" : "No")], ["Amenities", (r) => arr(r.myr_amenities).join(", ") || "—"],
    ];
    const best = Math.min(...chosen.map((r) => r.rent_amount));
    return (
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        <Button kind="ghost" title="← Wapas" onPress={() => setCmp(false)} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ width: 76 }} />
          {chosen.map((r) => (
            <Pressable key={r.id} style={{ flex: 1 }} onPress={() => router.push({ pathname: "/room/[id]", params: { id: r.id } })}>
              {cover(r) ? <Image source={{ uri: cover(r)! }} style={{ height: 80, borderRadius: 10, backgroundColor: c.soft }} /> : <View style={{ height: 80, borderRadius: 10, backgroundColor: c.soft }} />}
              <Text numberOfLines={2} style={{ color: c.text, fontWeight: "700", fontSize: 12, marginTop: 4 }}>{r.properties?.name} · {r.room_number}</Text>
            </Pressable>
          ))}
        </View>
        {rows.map(([k, f]) => (
          <View key={k} style={{ flexDirection: "row", gap: 8, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 8 }}>
            <Text style={{ width: 76, color: c.muted, fontSize: 12 }}>{k}</Text>
            {chosen.map((r) => <Text key={r.id} style={{ flex: 1, color: k === "Rent" && r.rent_amount === best ? c.primary : c.text, fontWeight: k === "Rent" ? "800" : "500", fontSize: 13 }}>{f(r)}</Text>)}
          </View>
        ))}
      </ScrollView>
    );
  }

  return (
    <FlatList
      data={rooms} keyExtractor={(r) => r.id} contentContainerStyle={{ padding: 16, gap: 12 }} refreshing={q.isRefetching} onRefresh={() => q.refetch()}
      ListHeaderComponent={<View style={{ gap: 8 }}><ErrorText error={q.error} />
        {rooms.length > 1 && <Text style={{ color: c.muted, fontSize: 12 }}>Compare ke liye 2–3 rooms select karein</Text>}
        {pick.length >= 2 && <Button title={t("Compare {n} rooms", { n: pick.length })} onPress={() => setCmp(true)} />}</View>}
      ListEmptyComponent={<Empty text={q.isLoading ? "Loading…" : "Koi saved room nahi. Room par ❤ dabaiye."} />}
      renderItem={({ item: r }) => {
        const on = pick.includes(r.id);
        return (
          <Pressable onPress={() => router.push({ pathname: "/room/[id]", params: { id: r.id } })}>
            <Card style={{ padding: 0, overflow: "hidden", borderColor: on ? c.primary : c.border, borderWidth: on ? 2 : 1 }}>
              <View>
                {cover(r) ? <Image source={{ uri: cover(r)! }} style={{ height: 130, width: "100%", backgroundColor: c.soft }} /> : <View style={{ height: 130, backgroundColor: c.soft }} />}
                <Heart roomId={r.id} style={{ position: "absolute", right: 10, top: 10 }} />
              </View>
              <View style={{ padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.text, fontWeight: "700" }} numberOfLines={1}>{r.properties?.name} · Room {r.room_number}</Text>
                  <Text style={{ color: c.muted }}>{inr(r.rent_amount)}/mo · {r.properties?.myr_city || r.properties?.city}{!r.myr_available ? " · Not available" : ""}</Text>
                </View>
                <Button kind={on ? "primary" : "ghost"} title={on ? "Selected" : "Compare"} onPress={() => setPick((p) => (p.includes(r.id) ? p.filter((x) => x !== r.id) : [...p, r.id].slice(-3)))} />
              </View>
            </Card>
          </Pressable>
        );
      }}
    />
  );
}
