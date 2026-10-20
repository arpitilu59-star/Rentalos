import React, { useState } from "react";
import { Alert, Image, Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Pill } from "@/lib/ui2";
import { useColors } from "@/theme";

type Ph = { id: string; url: string; verification_status: string; distance_m: number | null };

/** Camera-only photos taken ON the property (GPS within 50 m ⇒ verified). Gallery uploads are not offered. */
export default function Photos() {
  const c = useColors();
  const qc = useQueryClient();
  const { kind, id } = useLocalSearchParams<{ kind: "room" | "property"; id: string }>();
  const q = useQuery({
    queryKey: ["photos", kind, id],
    queryFn: () => api<{ photos: Ph[] }>("l/photos", { kind, id }),
  });
  const [err, setErr] = useState<unknown>(null);
  const done = () => {
    qc.invalidateQueries({ queryKey: ["photos", kind, id] });
    qc.invalidateQueries({ queryKey: ["listing"] });
  };
  const snap = useMutation({
    mutationFn: async () => {
      setErr(null);
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.status !== "granted")
        throw new Error(
          "Location permission chahiye — photo property par li gayi hai ye verify hota hai.",
        );
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== "granted") throw new Error("Camera permission chahiye.");
      const shot = await ImagePicker.launchCameraAsync({
        quality: 0.6,
        base64: true,
        mediaTypes: ["images"],
      });
      if (shot.canceled || !shot.assets[0]?.base64) throw new Error("cancelled");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const path = `${uid}/${id}-${Date.now()}.jpg`;
      const bin = Uint8Array.from(atob(shot.assets[0].base64), (ch) => ch.charCodeAt(0));
      const { error } = await supabase.storage
        .from("live-feed-photos")
        .upload(path, bin, { contentType: "image/jpeg" });
      if (error) throw new Error("Photo upload nahi hui. Internet check karke dobara try karein.");
      return api<{ verification_status: string }>("l/photo/add", {
        kind,
        id,
        storage_path: path,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    },
    onSuccess: (r) => {
      done();
      if (r.verification_status === "flagged")
        Alert.alert(
          "Photo verify nahi hui",
          "Ye photo property se 50 m se door li gayi lagti hai. Property par jaakar dobara kheenchein.",
        );
    },
    onError: (e) => {
      if ((e as Error).message !== "cancelled") setErr(e);
    },
  });
  const del = useMutation({
    mutationFn: (pid: string) => api("l/photo/delete", { id: pid }),
    onSuccess: done,
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Photo property par khade hokar camera se kheenchein. Location 50 m ke andar ho to photo
          apne aap verify ho jaati hai aur tenants ko dikhti hai. Maximum 12 photos.
        </Text>
      </Card>
      <Button
        title="📷 Nayi photo kheenchein"
        busy={snap.isPending}
        onPress={() => snap.mutate()}
      />
      <ErrorText error={err ?? del.error} />
      {q.data?.photos.length === 0 ? <Empty text="Abhi koi photo nahi." /> : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {q.data?.photos.map((p) => (
          <View key={p.id} style={{ width: "48%", gap: 6 }}>
            <Image
              source={{ uri: p.url }}
              style={{ width: "100%", aspectRatio: 1, borderRadius: 12, backgroundColor: c.border }}
            />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Pill
                text={
                  p.verification_status === "verified"
                    ? "Verified"
                    : p.verification_status === "flagged"
                      ? "Door se li"
                      : p.verification_status === "rejected"
                        ? "Reject"
                        : "Pending"
                }
                tone={
                  p.verification_status === "verified"
                    ? "ok"
                    : p.verification_status === "pending"
                      ? "muted"
                      : "danger"
                }
              />
              <Pressable onPress={() => del.mutate(p.id)}>
                <Text style={{ color: c.danger, fontSize: 12, fontWeight: "700" }}>Delete</Text>
              </Pressable>
            </View>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
