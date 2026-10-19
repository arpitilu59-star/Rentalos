import React from "react";
import { Alert, Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Pill } from "@/lib/ui2";
import { useColors, inr } from "@/theme";

type Room = { id: string; room_number: string; rent_amount: number; capacity: number; occupied: number; is_public: boolean; occupant_type: string | null; room_size: string | null };
type Prop = { id: string; name: string; city: string | null; is_public_listing: boolean; termsCompleteness: number; current_terms_version: number | null; rooms: Room[] };

export default function RoomsTab() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["props"], queryFn: () => api<{ properties: Prop[] }>("l/properties") });
  const del = useMutation({
    mutationFn: (p: { path: string; id: string }) => api(p.path, { id: p.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["props"] }); qc.invalidateQueries({ queryKey: ["home"] }); },
  });
  const confirmDel = (what: string, path: string, id: string) =>
    Alert.alert(`${what} delete karein?`, "Ye wapas nahi aayega.", [{ text: "Nahi" }, { text: "Delete", style: "destructive", onPress: () => del.mutate({ path, id }) }]);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <Button title="+ Nayi property" onPress={() => router.push("/property-form" as never)} />
      <ErrorText error={q.error ?? del.error} />
      {q.isLoading ? <SkeletonList n={2} height={140} /> : null}
      {q.data && q.data.properties.length === 0 ? <Empty text="Abhi koi property nahi hai. Upar se pehli property add karein." /> : null}
      {q.data?.properties.map((p) => (
        <Card key={p.id} style={{ gap: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontSize: 17, fontWeight: "800" }}>{p.name}</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>{p.city ?? "City nahi bhari"}</Text>
            </View>
            <Pill text={p.is_public_listing ? "Listed" : "Listed nahi"} tone={p.is_public_listing ? "ok" : "muted"} />
          </View>
          <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
            <Button kind="ghost" title={p.current_terms_version ? `Terms (${p.termsCompleteness}%)` : "Terms bharein"} onPress={() => router.push(`/terms/${p.id}` as never)} style={{ paddingVertical: 8 }} />
            <Button kind="ghost" title="Edit" onPress={() => router.push({ pathname: "/property-form", params: { id: p.id } } as never)} style={{ paddingVertical: 8 }} />
            <Button kind="ghost" title="Delete" onPress={() => confirmDel("Property", "l/property/delete", p.id)} style={{ paddingVertical: 8 }} />
          </View>
          {p.rooms.map((r) => (
            <Pressable key={r.id} onPress={() => router.push(`/listing/${r.id}` as never)}>
              <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, gap: 6 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.text, fontWeight: "700" }}>Room {r.room_number} · {inr(r.rent_amount)}</Text>
                  <Pill text={r.is_public ? "Live" : "Draft"} tone={r.is_public ? "ok" : "warn"} />
                </View>
                <Text style={{ color: c.muted, fontSize: 12 }}>{r.occupied}/{r.capacity} bhare · {r.is_public ? "Tenants ko dikh raha hai" : "List karne ke liye tap karein"}</Text>
                <View style={{ flexDirection: "row", gap: 14 }}>
                  <Pressable onPress={() => router.push({ pathname: "/room-form", params: { property_id: p.id, id: r.id } } as never)}><Text style={{ color: c.primary, fontWeight: "700", fontSize: 13 }}>Edit</Text></Pressable>
                  <Pressable onPress={() => confirmDel("Room", "l/room/delete", r.id)}><Text style={{ color: c.danger, fontWeight: "700", fontSize: 13 }}>Delete</Text></Pressable>
                </View>
              </View>
            </Pressable>
          ))}
          <Button title="+ Room add karein" onPress={() => router.push({ pathname: "/room-form", params: { property_id: p.id } } as never)} />
        </Card>
      ))}
    </ScrollView>
  );
}
