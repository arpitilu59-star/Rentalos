import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Choice, Field, Pill } from "@/lib/ui2";
import { SkeletonList } from "@/components/Skeleton";
import { useColors } from "@/theme";

type Item = { key: string; label: string; done: boolean; hint?: string; fix: "property" | "room" | "terms" | "photos" | "profile" | "listing" };
type L = {
  items: Item[]; ready: boolean; photosRequired: boolean;
  room: { id: string; number: string; published: boolean }; property: { id: string; name: string };
  values: { amenities: string[]; description: string; deposit: number | null; pDescription: string; propertyType: string | null };
};
const TYPES: Array<[string, string]> = [["pg", "PG"], ["room", "Room"], ["flat", "Flat"], ["hostel", "Hostel"], ["shared", "Shared"]];
const AMEN = ["WiFi", "AC", "Geyser", "Fridge", "TV", "Washing machine", "Attached bathroom", "Balcony", "Wardrobe", "Bed + mattress", "Study table", "Power backup", "Lift", "CCTV", "Parking", "Housekeeping", "Meals", "Water purifier"];

export default function Listing() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const q = useQuery({ queryKey: ["listing", roomId], queryFn: () => api<L>("l/listing", { room_id: roomId }) });
  const d = q.data;
  const [ptype, setPtype] = useState<string | null>(null);
  const [pdesc, setPdesc] = useState(""); const [rdesc, setRdesc] = useState(""); const [dep, setDep] = useState("");
  const [amen, setAmen] = useState<string[]>([]);
  useEffect(() => {
    if (!d) return;
    setPtype(d.values.propertyType); setPdesc(d.values.pDescription); setRdesc(d.values.description);
    setDep(d.values.deposit != null ? String(d.values.deposit) : ""); setAmen(d.values.amenities);
  }, [d?.room.id, q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { qc.invalidateQueries({ queryKey: ["listing", roomId] }); qc.invalidateQueries({ queryKey: ["props"] }); qc.invalidateQueries({ queryKey: ["home"] }); };
  const save = useMutation({
    mutationFn: () => api("l/listing/save", { room_id: roomId, property_type: ptype ?? undefined, p_description: pdesc, description: rdesc, deposit: dep === "" ? undefined : Number(dep), amenities: amen }),
    onSuccess: refresh,
  });
  const publish = useMutation({
    mutationFn: (on: boolean) => api("l/listing/publish", { room_id: roomId, publish: on }),
    onSuccess: refresh,
  });
  const go = (i: Item) => {
    if (!d) return;
    if (i.fix === "property") router.push({ pathname: "/property-form", params: { id: d.property.id } } as never);
    else if (i.fix === "room") router.push({ pathname: "/room-form", params: { property_id: d.property.id, id: d.room.id } } as never);
    else if (i.fix === "terms") router.push(`/terms/${d.property.id}` as never);
    else if (i.fix === "photos") router.push({ pathname: "/photos", params: { kind: "room", id: d.room.id } } as never);
    else if (i.fix === "profile") router.push("/profile" as never);
  };
  const left = d?.items.filter((i) => !i.done).length ?? 0;
  const toggle = (a: string) => setAmen((x) => (x.includes(a) ? x.filter((y) => y !== a) : [...x, a]));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      {!d ? <SkeletonList n={3} height={120} /> : (<>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>{d.property.name} · Room {d.room.number}</Text>
          <Pill text={d.room.published ? "Live" : "Draft"} tone={d.room.published ? "ok" : "warn"} />
        </View>

        <Card style={{ gap: 4 }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>{left === 0 ? "Sab kuch bhar diya ✓" : `${left} cheezein baaki hain`}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>Jab tak ye sab poora nahi hota, room tenants ko nahi dikhega.</Text>
          {d.items.map((i) => (
            <Pressable key={i.key} disabled={i.done || i.fix === "listing"} onPress={() => go(i)} style={{ flexDirection: "row", gap: 10, paddingVertical: 6, alignItems: "flex-start" }}>
              <Ionicons name={i.done ? "checkmark-circle" : "ellipse-outline"} size={22} color={i.done ? c.ok : c.warn} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: i.done ? c.muted : c.text, fontWeight: "600" }}>{i.label}</Text>
                {i.hint && !i.done ? <Text style={{ color: c.warn, fontSize: 12 }}>{i.hint}</Text> : null}
              </View>
              {!i.done && i.fix !== "listing" ? <Text style={{ color: c.primary, fontWeight: "700", fontSize: 13 }}>Bharein →</Text> : null}
            </Pressable>
          ))}
        </Card>

        <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>Listing ki details</Text>
        <Choice label="Property type" required value={ptype} options={TYPES} onChange={setPtype} />
        <Field label="Property ka description" required value={pdesc} onChange={setPdesc} multiline placeholder="Location, aas-paas kya hai (metro, market, college), facilities…" hint="Kam se kam 20 akshar." maxLength={2000} />
        <Field label="Security deposit (₹)" required value={dep} onChange={setDep} keyboard="numeric" hint="Deposit nahi hai to 0 likhein." />
        <View style={{ gap: 6 }}>
          <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>Amenities <Text style={{ color: c.danger }}>*</Text></Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AMEN.map((a) => (
              <Pressable key={a} onPress={() => toggle(a)} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1, backgroundColor: amen.includes(a) ? c.primary : c.card, borderColor: amen.includes(a) ? c.primary : c.border }}>
                <Text style={{ color: amen.includes(a) ? c.onPrimary : c.text, fontSize: 13, fontWeight: "600" }}>{a}</Text>
              </Pressable>
            ))}
          </View>
        </View>
        <Field label="Room ka description" required value={rdesc} onChange={setRdesc} multiline placeholder="Room kaisa hai, floor, kya-kya milta hai…" hint="Kam se kam 20 akshar." maxLength={1000} />
        <ErrorText error={save.error ?? publish.error} />
        <Button kind="ghost" title="Details save karein" busy={save.isPending} onPress={() => save.mutate()} />
        {d.photosRequired ? <Button kind="ghost" title="📷 Live photos kheenchein" onPress={() => router.push({ pathname: "/photos", params: { kind: "room", id: d.room.id } } as never)} /> : null}
        {d.room.published
          ? <Button kind="danger" title="Listing band karein (unpublish)" busy={publish.isPending} onPress={() => publish.mutate(false)} />
          : <Button title={d.ready ? "Room publish karein" : `Pehle ${left} cheezein poori karein`} busy={publish.isPending} disabled={!d.ready} onPress={() => publish.mutate(true)} />}
        {publish.isSuccess && d.room.published ? <Text style={{ color: c.ok, textAlign: "center" }}>Room ab tenants ko dikh raha hai ✓</Text> : null}
      </>)}
    </ScrollView>
  );
}
