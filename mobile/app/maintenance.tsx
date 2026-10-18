import React, { useState } from "react";
import { FlatList, Image, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import { Button, Card, Chip, Empty, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

type T = { id: string; title: string; description: string | null; priority: string; status: string; photos: string[]; resolution_notes: string | null; created_at: string };
type Res = { tickets: T[]; tenancies: Array<{ id: string; rooms: { room_number: string; properties: { name: string } | null } | null }> };
const PRI = ["low", "medium", "high", "urgent"] as const;

export default function Maintenance() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api<Res>("tickets") });
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [pri, setPri] = useState<(typeof PRI)[number]>("medium");
  const [tenant, setTenant] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Array<{ uri: string; b64: string }>>([]);
  const [err, setErr] = useState<string | null>(null);
  const tenants = q.data?.tenancies ?? [];
  const tid = tenant ?? tenants[0]?.id;

  const add = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(camera ? "Camera ki permission chahiye." : "Gallery ki permission chahiye."); return; }
    const opts = { mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 0.5, base64: true };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]?.base64) setPhotos((p) => [...p, { uri: r.assets[0].uri, b64: r.assets[0].base64! }].slice(0, 3));
  };
  const create = useMutation({
    mutationFn: () => api("tickets/create", { tenant_id: tid, title, description: desc, priority: pri, photos_base64: photos.map((p) => p.b64) }),
    onSuccess: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setTitle(""); setDesc(""); setPhotos([]); setPri("medium"); setOpen(false); qc.invalidateQueries({ queryKey: ["tickets"] }); },
  });
  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;
  const sc = (s: string) => (s === "resolved" || s === "closed" ? c.primary : s === "in_progress" ? c.text : c.warn);

  return (
    <FlatList
      data={q.data?.tickets ?? []} keyExtractor={(t) => t.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshing={q.isRefetching} onRefresh={() => q.refetch()}
      ListHeaderComponent={<View style={{ gap: 10 }}>
        <ErrorText error={q.error} />
        {tenants.length > 0 && !open && <Button title="+ Nayi complaint" onPress={() => setOpen(true)} />}
        {open && (
          <Card style={{ gap: 10 }}>
            {tenants.length > 1 && <ScrollView horizontal showsHorizontalScrollIndicator={false}>{tenants.map((t) => <Chip key={t.id} label={`${t.rooms?.properties?.name ?? ""} ${t.rooms?.room_number ?? ""}`} active={tid === t.id} onPress={() => setTenant(t.id)} />)}</ScrollView>}
            <TextInput value={title} onChangeText={setTitle} placeholder="Kya problem hai? (e.g. Tap leaking)" placeholderTextColor={c.muted} style={input} />
            <TextInput value={desc} onChangeText={setDesc} placeholder="Detail (optional)" multiline placeholderTextColor={c.muted} style={[input, { minHeight: 70, textAlignVertical: "top" }]} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>{PRI.map((p) => <Chip key={p} label={p[0].toUpperCase() + p.slice(1)} active={pri === p} onPress={() => setPri(p)} />)}</ScrollView>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button kind="ghost" title="📷 Camera" style={{ flex: 1 }} onPress={() => add(true)} />
              <Button kind="ghost" title="🖼 Gallery" style={{ flex: 1 }} onPress={() => add(false)} />
            </View>
            {photos.length > 0 && <ScrollView horizontal>{photos.map((p, i) => <Image key={i} source={{ uri: p.uri }} style={{ width: 90, height: 90, borderRadius: 10, marginRight: 8 }} />)}</ScrollView>}
            <ErrorText error={err ?? create.error} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button kind="ghost" title="Cancel" onPress={() => setOpen(false)} />
              <Button title="Submit" style={{ flex: 1 }} busy={create.isPending} disabled={title.trim().length < 2 || !tid} onPress={() => { setErr(null); create.mutate(); }} />
            </View>
          </Card>
        )}
      </View>}
      ListEmptyComponent={<Empty text={q.isLoading ? "Loading…" : tenants.length ? "Koi complaint nahi. Kuch kharab ho to upar se daalein." : "Complaint daalne ke liye pehle kisi room me tenant hona zaroori hai."} />}
      renderItem={({ item: t }) => (
        <Card style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>{t.title}</Text>
            <Text style={{ color: sc(t.status), fontWeight: "800", textTransform: "uppercase", fontSize: 11 }}>{t.status.replace("_", " ")}</Text>
          </View>
          {t.description ? <Text style={{ color: c.muted }}>{t.description}</Text> : null}
          {t.photos.length > 0 && <ScrollView horizontal>{t.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 84, height: 84, borderRadius: 10, marginRight: 8, backgroundColor: c.soft }} />)}</ScrollView>}
          <Text style={{ color: c.muted, fontSize: 12 }}>{t.priority} · {new Date(t.created_at).toLocaleString("en-IN")}</Text>
          {t.resolution_notes ? <Text style={{ color: c.primary, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6 }}>Owner: {t.resolution_notes}</Text> : null}
        </Card>
      )}
    />
  );
}
