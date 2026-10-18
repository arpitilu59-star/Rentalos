import React, { useEffect, useState } from "react";
import { FlatList, Image, Pressable, ScrollView, View } from "react-native";
import { Text, TextInput } from "@/components/Text";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Card, Chip, Empty, ErrorText } from "@/components/ui";
import { useColors, inr, R } from "@/theme";
import * as Location from "expo-location";
import { useT } from "@/lib/i18n";
import { Heart } from "@/components/Heart";

const km = (a: number, b: number, c: number, d: number) => { const t = (x: number) => (x * Math.PI) / 180; const h = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 12742 * Math.asin(Math.sqrt(h)); };

export type RoomRow = {
  id: string; room_number: string; rent_amount: number; occupant_type: string | null; room_size: string | null; myr_photos: unknown;
  properties: { name: string; myr_city: string | null; city: string | null; myr_cover_photos: unknown; verification_status: string | null; myr_lat?: number | null; myr_lng?: number | null; latitude?: number | null; longitude?: number | null } | null;
};
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
export const cover = (r: RoomRow) => strArr(r.myr_photos)[0] ?? strArr(r.properties?.myr_cover_photos)[0] ?? null;
export const OCC = [["boys", "Boys"], ["girls", "Girls"], ["family", "Family"]] as const;
export const SIZES = [["single_room", "Single room"], ["shared_room", "Shared room"], ["1rk", "1 RK"], ["1bhk", "1 BHK"], ["2bhk", "2 BHK"], ["3bhk", "3 BHK"], ["4bhk_plus", "4+ BHK"]] as const;

export default function Explore() {
  const c = useColors();
  const t = useT();
  const router = useRouter();
  const [city, setCity] = useState("");
  const [applied, setApplied] = useState("");
  const [occ, setOcc] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const nearMe = async () => {
    if (me) { setMe(null); return; }
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) { setLocErr("Location permission chahiye."); return; }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocErr(null); setMe({ lat: pos.coords.latitude, lng: pos.coords.longitude });
  };
  const distOf = (r: RoomRow) => { const p = r.properties; const la = p?.myr_lat ?? p?.latitude, ln = p?.myr_lng ?? p?.longitude; return me && la != null && ln != null ? km(me.lat, me.lng, la, ln) : null; };
  useEffect(() => { const t = setTimeout(() => setApplied(city.trim()), 400); return () => clearTimeout(t); }, [city]);

  const q = useQuery({
    queryKey: ["rooms", applied, occ, size],
    queryFn: async () => {
      let s = supabase
        .from("rooms")
        .select("id, room_number, rent_amount, occupant_type, room_size, myr_photos, properties!inner(name, myr_city, city, myr_cover_photos, verification_status, myr_lat, myr_lng, latitude, longitude)")
        .eq("is_public", true).eq("myr_available", true).order("rent_amount", { ascending: true }).limit(40);
      if (applied) { const p = applied.replace(/[^A-Za-z0-9 ]/g, ""); s = s.or(`myr_city.ilike.%${p}%,city.ilike.%${p}%`, { foreignTable: "properties" }); }
      if (occ) s = s.in("occupant_type", [occ, "anyone"]);
      if (size) s = s.eq("room_size", size);
      const { data, error } = await s;
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as RoomRow[];
    },
  });

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, paddingBottom: 6, gap: 10 }}>
        <TextInput value={city} onChangeText={setCity} placeholder="Search city or area (e.g. Jaipur)" placeholderTextColor={c.muted}
          style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Chip label={me ? "📍 Near me ✓" : "📍 Near me"} active={!!me} onPress={nearMe} />
          {OCC.map(([k, l]) => <Chip key={k} label={l} active={occ === k} onPress={() => setOcc(occ === k ? null : k)} />)}
          {SIZES.map(([k, l]) => <Chip key={k} label={l} active={size === k} onPress={() => setSize(size === k ? null : k)} />)}
        </ScrollView>
      </View>
      <ErrorText error={q.error ?? (locErr ? new Error(locErr) : null)} />
      <FlatList
        data={me ? [...(q.data ?? [])].sort((a, b) => (distOf(a) ?? 1e9) - (distOf(b) ?? 1e9)) : (q.data ?? [])}
        keyExtractor={(r) => r.id}
        contentContainerStyle={{ padding: 16, gap: 14 }}
        refreshing={q.isRefetching}
        onRefresh={() => q.refetch()}
        ListEmptyComponent={q.isLoading ? <Empty text="Loading rooms…" /> : <Empty text="Koi room nahi mila. Filter ya city badal kar dekhein." />}
        renderItem={({ item: r }) => {
          const img = cover(r);
          return (
            <Pressable onPress={() => router.push({ pathname: "/room/[id]", params: { id: r.id } })}>
              <Card style={{ padding: 0, overflow: "hidden" }}>
                <View>{img ? <Image source={{ uri: img }} style={{ height: 170, width: "100%", backgroundColor: c.soft }} /> : <View style={{ height: 170, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Text style={{ color: c.muted }}>No photo</Text></View>}<Heart roomId={r.id} style={{ position: "absolute", right: 10, top: 10 }} /></View>
                <View style={{ padding: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                    <Text style={{ color: c.text, fontWeight: "700", fontSize: 16, flex: 1 }} numberOfLines={1}>{r.properties?.name} · Room {r.room_number}</Text>
                    <Text style={{ color: c.primary, fontWeight: "800", fontSize: 16 }}>{inr(r.rent_amount)}</Text>
                  </View>
                  <Text style={{ color: c.muted, marginTop: 3 }}>{r.properties?.myr_city || r.properties?.city}{r.occupant_type ? ` · ${t(OCC.find(([k]) => k === r.occupant_type)?.[1] ?? "Anyone")}` : ""}{r.room_size ? ` · ${t(SIZES.find(([k]) => k === r.room_size)?.[1] ?? "")}` : ""}</Text>
                  {distOf(r) != null && <Text style={{ color: c.muted, marginTop: 4 }}>📍 {distOf(r)!.toFixed(1)} km door</Text>}
                  {r.properties?.verification_status === "verified" && <Text style={{ color: c.primary, marginTop: 6, fontWeight: "600", fontSize: 12 }}>✔ Verified property</Text>}
                </View>
              </Card>
            </Pressable>
          );
        }}
      />
    </View>
  );
}
