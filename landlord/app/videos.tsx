import React, { useState } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { VideoView, useVideoPlayer } from "expo-video";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Pill } from "@/lib/ui2";
import { useColors, dmy } from "@/theme";

type V = {
  id: string;
  url: string | null;
  verification_status: string;
  distance_m: number | null;
  duration_seconds: number;
  created_at: string;
  expires_at: string | null;
};
const MAX_BYTES = 60 * 1024 * 1024;

function Player({ url }: { url: string }) {
  const player = useVideoPlayer(url, (p) => {
    p.loop = false;
  });
  return (
    <VideoView
      player={player}
      nativeControls
      contentFit="contain"
      style={{ width: "100%", aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: "#000" }}
    />
  );
}

/** Record a 5–45 s walkthrough ON the property. Stored privately; tenants see it only after Rentalos verifies it. */
export default function Videos() {
  const c = useColors();
  const qc = useQueryClient();
  const { room_id } = useLocalSearchParams<{ room_id: string }>();
  const q = useQuery({
    queryKey: ["videos", room_id],
    queryFn: () => api<{ videos: V[]; can_record: boolean }>("l/videos", { room_id }),
  });
  const [err, setErr] = useState<unknown>(null);
  const [step, setStep] = useState("");
  const done = () => qc.invalidateQueries({ queryKey: ["videos", room_id] });

  const rec = useMutation({
    mutationFn: async () => {
      setErr(null);
      const loc = await Location.requestForegroundPermissionsAsync();
      if (loc.status !== "granted")
        throw new Error(
          "Location permission chahiye — video property par bani hai ye verify hota hai.",
        );
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (cam.status !== "granted") throw new Error("Camera permission chahiye.");
      const shot = await ImagePicker.launchCameraAsync({
        mediaTypes: ["videos"],
        videoMaxDuration: 45,
        quality: 0.5,
      });
      if (shot.canceled || !shot.assets[0]) throw new Error("cancelled");
      const a = shot.assets[0];
      const secs = a.duration != null ? a.duration / 1000 : null;
      if (secs != null && secs < 5) throw new Error("Kam se kam 5 second ki video banayein.");
      if (secs != null && secs > 46) throw new Error("Video 45 second se zyada nahi ho sakti.");
      if (a.fileSize && a.fileSize > MAX_BYTES)
        throw new Error(
          `Video ${Math.round(a.fileSize / 1048576)} MB ki hai (limit 60 MB). Chhoti video banayein.`,
        );
      setStep("Location le rahe hain…");
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setStep("Video upload ho rahi hai… (thoda time lag sakta hai)");
      const { data: u } = await supabase.auth.getUser();
      const uid = u.user?.id;
      if (!uid) throw new Error("Please sign in again.");
      const isMov = (a.mimeType ?? "").includes("quicktime") || /\.mov$/i.test(a.uri);
      const ext = isMov ? "mov" : "mp4";
      const path = `${uid}/room-${Date.now()}.${ext}`;
      const buf = await (await fetch(a.uri)).arrayBuffer();
      if (buf.byteLength > MAX_BYTES)
        throw new Error("Video 60 MB se badi hai. Chhoti video banayein.");
      const { error } = await supabase.storage
        .from("live-feed-videos")
        .upload(path, buf, { contentType: isMov ? "video/quicktime" : "video/mp4" });
      if (error) throw new Error("Video upload nahi hui. Internet check karke dobara try karein.");
      setStep("Save ho rahi hai…");
      return api<{ verification_status: string }>("l/video/add", {
        room_id,
        storage_path: path,
        duration_seconds: secs ?? 10,
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
      });
    },
    onSuccess: (r) => {
      done();
      Alert.alert(
        r.verification_status === "flagged" ? "Video door se li gayi" : "Video bhej di gayi",
        r.verification_status === "flagged"
          ? "Ye video property se 50 m se door li gayi lagti hai. Property par jaakar dobara record karein."
          : "Rentalos team verify karegi. Verify hote hi tenants ko dikhegi.",
      );
    },
    onError: (e) => {
      if ((e as Error).message !== "cancelled") setErr(e);
    },
    onSettled: () => setStep(""),
  });
  const del = useMutation({
    mutationFn: (id: string) => api("l/video/delete", { id }),
    onSuccess: done,
  });
  const label = (s: string) =>
    s === "verified"
      ? "Verified ✓"
      : s === "flagged"
        ? "Door se li"
        : s === "rejected"
          ? "Reject"
          : "Review mein";
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Room mein khade hokar 5–45 second ki walkthrough record karein (camera se hi, gallery se
          nahi). Location property ke 50 m ke andar honi chahiye. Verify hone ke baad ~150 din tak
          tenants ko dikhegi.
        </Text>
      </Card>
      {q.data && !q.data.can_record ? (
        <Card style={{ borderColor: c.warn }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>Plan mein live video nahi hai</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            Live video wale plan par hi record kar sakte hain. Plan website se badlein.
          </Text>
        </Card>
      ) : (
        <Button
          title="🎥 Nayi video record karein"
          busy={rec.isPending}
          onPress={() => rec.mutate()}
        />
      )}
      {step ? <Text style={{ color: c.muted, textAlign: "center" }}>{step}</Text> : null}
      <ErrorText error={err ?? q.error ?? del.error} />
      {q.data && !q.data.videos.length ? <Empty text="Abhi koi video nahi." /> : null}
      {q.data?.videos.map((v) => (
        <Card key={v.id} style={{ gap: 8 }}>
          {v.url ? <Player url={v.url} /> : null}
          <View
            style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}
          >
            <Pill
              text={label(v.verification_status)}
              tone={
                v.verification_status === "verified"
                  ? "ok"
                  : v.verification_status === "pending"
                    ? "warn"
                    : "danger"
              }
            />
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {v.duration_seconds}s · {dmy(v.created_at)}
            </Text>
            <Pressable onPress={() => del.mutate(v.id)}>
              <Text style={{ color: c.danger, fontSize: 12, fontWeight: "700" }}>Delete</Text>
            </Pressable>
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
