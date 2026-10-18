import React, { useState } from "react";
import { Image, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, Card, Chip, ErrorText } from "@/components/ui";
import { useColors } from "@/theme";

const TYPES: Array<[string, string]> = [["aadhaar", "Aadhaar"], ["pan", "PAN"], ["driving_license", "Driving licence"], ["voter_id", "Voter ID"], ["passport", "Passport"], ["college_id", "College / office ID"], ["photo", "Selfie"]];
const label = (k: string) => TYPES.find(([t]) => t === k)?.[1] ?? k;
type Doc = { id: string; doc_type: string; status: "pending" | "verified" | "rejected"; admin_note: string | null; created_at: string };

export default function Verify() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kyc"], queryFn: () => api<{ verified: boolean; docs: Doc[] }>("kyc") });
  const [type, setType] = useState("aadhaar");
  const [img, setImg] = useState<{ uri: string; b64: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pick = async (camera: boolean) => {
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr(camera ? "Camera ki permission chahiye." : "Gallery ki permission chahiye."); return; }
    const opts = { mediaTypes: ["images"] as ImagePicker.MediaType[], quality: 0.6, base64: true };
    const r = camera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    if (!r.canceled && r.assets[0]?.base64) { setImg({ uri: r.assets[0].uri, b64: r.assets[0].base64 }); setErr(null); }
  };
  const up = useMutation({
    mutationFn: () => api("kyc/upload", { doc_type: type, image_base64: img!.b64, mime: "image/jpeg" }),
    onSuccess: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setImg(null); qc.invalidateQueries({ queryKey: ["kyc"] }); qc.invalidateQueries({ queryKey: ["home"] }); },
  });
  const d = q.data;
  const col = (s: string) => (s === "verified" ? c.primary : s === "rejected" ? c.danger : c.warn);

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <ErrorText error={q.error} />
      <Card style={{ backgroundColor: d?.verified ? c.soft : c.card, flexDirection: "row", gap: 12, alignItems: "center" }}>
        <Ionicons name={d?.verified ? "shield-checkmark" : "shield-outline"} size={40} color={d?.verified ? c.primary : c.muted} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 17 }}>{d?.verified ? "Verified tenant ✔" : "Abhi verified nahi"}</Text>
          <Text style={{ color: c.muted, marginTop: 2 }}>{d?.verified ? "Owners ko aapke naam ke saath Verified badge dikhta hai." : "Ek valid ID upload karein. Rentalos team check karke aapko Verified tenant badge degi — booking jaldi accept hoti hai."}</Text>
        </View>
      </Card>

      {!d?.verified && (
        <Card style={{ gap: 12 }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Document upload karein</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>{TYPES.map(([k, l]) => <Chip key={k} label={l} active={type === k} onPress={() => setType(k)} />)}</View>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button kind="ghost" title="📷 Camera" style={{ flex: 1 }} onPress={() => pick(true)} />
            <Button kind="ghost" title="🖼 Gallery" style={{ flex: 1 }} onPress={() => pick(false)} />
          </View>
          {img && <Image source={{ uri: img.uri }} style={{ height: 190, borderRadius: 12, backgroundColor: c.soft }} resizeMode="contain" />}
          <Text style={{ color: c.muted, fontSize: 12 }}>Photo saaf ho, poora document dikhe aur naam padha jaaye. Aapki file private rehti hai — sirf Rentalos admin dekhta hai.</Text>
          <ErrorText error={err ?? up.error} />
          <Button title="Upload karein" busy={up.isPending} disabled={!img} onPress={() => { setErr(null); up.mutate(); }} />
        </Card>
      )}

      {!!d?.docs.length && <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>MERE DOCUMENTS</Text>}
      {d?.docs.map((x) => (
        <Card key={x.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontWeight: "700" }}>{label(x.doc_type)}</Text>
            <Text style={{ color: col(x.status), fontWeight: "800", textTransform: "capitalize" }}>{x.status === "pending" ? "Review me" : x.status}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>{new Date(x.created_at).toLocaleDateString("en-IN")}</Text>
          {x.status === "rejected" && x.admin_note ? <Text style={{ color: c.danger }}>Reason: {x.admin_note}. Dobara upload karein.</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}
