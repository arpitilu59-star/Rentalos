import React, { useState } from "react";
import { Image, ScrollView, Text, TextInput, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

type Ov = {
  rooms: Array<{ tenant_id: string; room: string; property: string; last: { reading: number; date: string } | null }>;
  submissions: Array<{ id: string; tenant_id: string; reading: number; approved_reading: number | null; status: "pending" | "approved" | "rejected"; landlord_note: string | null; created_at: string }>;
};

export default function Meter() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["meter"], queryFn: () => api<Ov>("meter") });
  const [reading, setReading] = useState("");
  const [photo, setPhoto] = useState<{ uri: string; b64: string } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const room = q.data?.rooms[0];
  const waiting = q.data?.submissions.some((s) => s.status === "pending");

  const snap = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setErr("Camera ki permission chahiye."); return; }
    const r = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6, base64: true });
    if (!r.canceled && r.assets[0]?.base64) { setPhoto({ uri: r.assets[0].uri, b64: r.assets[0].base64 }); setErr(null); }
  };
  const submit = useMutation({
    mutationFn: () => api("meter/submit", { tenant_id: room!.tenant_id, reading: Number(reading), photo_base64: photo?.b64, note }),
    onSuccess: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setReading(""); setPhoto(null); setNote(""); qc.invalidateQueries({ queryKey: ["meter"] }); },
  });
  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;
  const col = (s: string) => (s === "approved" ? c.primary : s === "rejected" ? c.danger : c.warn);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <ErrorText error={q.error} />
      {q.data && !room && <Empty text="Meter reading bhejne ke liye pehle kisi room me tenant hona zaroori hai." />}
      {room && (
        <Card style={{ gap: 10 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{room.property} · Room {room.room}</Text>
          <Text style={{ color: c.muted }}>Pichhli reading: {room.last ? `${room.last.reading} (${new Date(room.last.date).toLocaleDateString("en-IN")})` : "abhi koi nahi"}</Text>
          {waiting ? (
            <Text style={{ color: c.warn, fontWeight: "700" }}>Aapki reading owner ke approval ka wait kar rahi hai. Approve hone par hi bill me judegi.</Text>
          ) : (<>
            <TextInput value={reading} onChangeText={setReading} keyboardType="numeric" placeholder="Abhi ki meter reading" placeholderTextColor={c.muted} style={input} />
            <Button kind="ghost" title={photo ? "📷 Photo dobara kheenchein" : "📷 Meter ki photo kheenchein"} onPress={snap} />
            {photo && <Image source={{ uri: photo.uri }} style={{ height: 170, borderRadius: 12, backgroundColor: c.soft }} resizeMode="contain" />}
            <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={c.muted} style={input} />
            <ErrorText error={err ?? submit.error} />
            <Button title="Owner ko bhejein" busy={submit.isPending} disabled={!reading || !photo} onPress={() => { setErr(null); submit.mutate(); }} />
            <Text style={{ color: c.muted, fontSize: 12 }}>Owner photo dekh kar number approve ya theek karega. Tabhi ye bill me add hoga.</Text>
          </>)}
        </Card>
      )}
      {!!q.data?.submissions.length && <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>MERI READINGS</Text>}
      {q.data?.submissions.map((s) => (
        <Card key={s.id} style={{ gap: 3 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontWeight: "700" }}>{s.reading}{s.status === "approved" && s.approved_reading != null && s.approved_reading !== s.reading ? `  →  ${s.approved_reading} (owner ne sahi kiya)` : ""}</Text>
            <Text style={{ color: col(s.status), fontWeight: "800", textTransform: "capitalize" }}>{s.status === "pending" ? "Waiting" : s.status}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>{new Date(s.created_at).toLocaleString("en-IN")}</Text>
          {s.landlord_note ? <Text style={{ color: c.muted }}>Owner: {s.landlord_note}</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}
