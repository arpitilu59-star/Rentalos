import React, { useState } from "react";
import { Dimensions, FlatList, Image, Linking, ScrollView, Share, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useT } from "@/lib/i18n";
import { Heart } from "@/components/Heart";
import { RoomVideo } from "@/components/RoomVideo";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { WEB } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { useColors, inr } from "@/theme";
import { OCC, SIZES } from "../(tabs)/explore";

const W = Dimensions.get("window").width;
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

export default function RoomScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const t = useT();
  const [idx, setIdx] = useState(0);
  const q = useQuery({
    queryKey: ["room", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rooms")
        .select("id, room_number, rent_amount, myr_deposit, occupant_type, room_size, myr_amenities, myr_description, myr_photos, properties(name, myr_city, city, myr_address, address, myr_cover_photos, terms_summary, myr_lat, myr_lng, latitude, longitude)")
        .eq("id", id).maybeSingle();
      if (error) throw new Error(error.message);
      return data as any;
    },
  });
  const { data: live } = useQuery({
    queryKey: ["room-live-photos", id],
    queryFn: async () => {
      const { data } = await supabase.from("live_feed_photos").select("storage_path").eq("room_id", id).eq("verification_status", "verified").order("created_at", { ascending: false }).limit(8);
      return (data ?? []).map((p: { storage_path: string }) => supabase.storage.from("live-feed-photos").getPublicUrl(p.storage_path).data.publicUrl);
    },
  });
  const vid = useQuery({ queryKey: ["room-video", id], queryFn: () => api<{ url: string | null }>("room/video", { room_id: id }) });
  const r = q.data;
  if (q.isLoading) return <Text style={{ color: c.muted, padding: 24 }}>Loading…</Text>;
  if (!r) return <View style={{ padding: 16 }}><ErrorText error={q.error ?? new Error("Room not found.")} /></View>;
  const photos = [...strArr(r.myr_photos), ...strArr(r.properties?.myr_cover_photos)];
  const occ = OCC.find(([k]) => k === r.occupant_type)?.[1];
  const size = SIZES.find(([k]) => k === r.room_size)?.[1];

  return (
    <ScrollView>
      {photos.length > 0 ? (
        <View>
          <FlatList data={photos} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(u, i) => u + i}
            onMomentumScrollEnd={(e) => setIdx(Math.round(e.nativeEvent.contentOffset.x / W))}
            renderItem={({ item }) => <Image source={{ uri: item }} style={{ width: W, height: 260, backgroundColor: c.soft }} />} />
          <Heart roomId={r.id} style={{ position: "absolute", right: 12, top: 12 }} />
          <Text style={{ position: "absolute", right: 12, bottom: 10, color: "#fff", backgroundColor: "#0008", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 99, fontSize: 12 }}>{idx + 1}/{photos.length}</Text>
        </View>
      ) : <View style={{ height: 200, backgroundColor: c.soft }} />}
      <View style={{ padding: 16, gap: 12 }}>
        <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>{r.properties?.name} · Room {r.room_number}</Text>
        <Text style={{ color: c.muted }}>{r.properties?.myr_address || r.properties?.address}, {r.properties?.myr_city || r.properties?.city}</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {occ && <Pill t={`${t("For")} ${t(occ)}`} />}{size && <Pill t={t(size)} />}
        </View>
        <Card>
          <Text style={{ color: c.primary, fontSize: 28, fontWeight: "800" }}>{inr(r.rent_amount)}<Text style={{ color: c.muted, fontSize: 14, fontWeight: "500" }}> / month</Text></Text>
          {r.myr_deposit != null && <Text style={{ color: c.muted, marginTop: 2 }}>Deposit {inr(r.myr_deposit)}</Text>}
        </Card>
        {r.myr_description ? <Text style={{ color: c.text, lineHeight: 21 }}>{r.myr_description}</Text> : null}
        {strArr(r.myr_amenities).length > 0 && <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>{strArr(r.myr_amenities).map((a) => <Pill key={a} t={a} />)}</View>}
        {vid.data?.url ? <RoomVideo url={vid.data.url} /> : null}
        {live && live.length > 0 && (
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "700" }}>Live photos (camera se, verified)</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>{live.map((u: string) => <Image key={u} source={{ uri: u }} style={{ width: 150, height: 110, borderRadius: 12, marginRight: 8, backgroundColor: c.soft }} />)}</ScrollView>
          </View>
        )}
        <Text style={{ color: c.muted, fontSize: 12 }}>Booking se pehle owner ke rental terms (rent, deposit, house rules) padhna aur accept karna zaroori hai.</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Button kind="ghost" title="📍 Map" style={{ flex: 1 }} onPress={() => {
            const p = r.properties; const la = p?.myr_lat ?? p?.latitude, ln = p?.myr_lng ?? p?.longitude;
            const q = la != null && ln != null ? `${la},${ln}` : encodeURIComponent(`${p?.myr_address || p?.address || p?.name}, ${p?.myr_city || p?.city || ""}`);
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
          }} />
          <Button kind="ghost" title="Share" style={{ flex: 1 }} onPress={() => Share.share({ message: `${r.properties?.name} Room ${r.room_number} — ${inr(r.rent_amount)}/month. ${WEB}/myr/room/${r.id}` })} />
        </View>
        <Button title="Request booking" onPress={() => router.push({ pathname: "/book/[roomId]", params: { roomId: r.id } })} />
      </View>
    </ScrollView>
  );
}
function Pill({ t }: { t: string }) {
  const c = useColors();
  return <Text style={{ color: c.primary, backgroundColor: c.soft, paddingHorizontal: 11, paddingVertical: 5, borderRadius: 99, fontSize: 12, fontWeight: "700", overflow: "hidden" }}>{t}</Text>;
}
