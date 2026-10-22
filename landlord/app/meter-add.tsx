import React, { useMemo, useState } from "react";
import { Alert, Image, Platform, Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { checkMeterReading } from "@/lib/meter-check";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Field, Pill } from "@/lib/ui2";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, R, dmy } from "@/theme";

type Room = {
  id: string;
  number: string;
  tenants: string[];
  last: { reading: number; date: string } | null;
  pending: number;
};
type Prop = { id: string; name: string; city: string | null; rooms: Room[] };
type Ctx = {
  property: string;
  city: string | null;
  room: string;
  tenants: string[];
  last: { reading: number; date: string } | null;
  typicalDelta: number | null;
  existingDates: string[];
  readings: Array<{
    id: string;
    reading: number;
    date: string;
    usage: number | null;
    exception: boolean;
    ocr: boolean;
  }>;
  submissions: Array<{
    id: string;
    reading: number;
    approved: number | null;
    status: string;
    date: string;
    note: string | null;
    tenant: string | null;
  }>;
};
const d2 = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

/** Guided, room-safe meter entry: property → room → (see last approved reading) → reading. */
export default function MeterAdd() {
  const params = useLocalSearchParams<{ room_id?: string }>();
  const [roomId, setRoomId] = useState<string | null>(params.room_id ?? null);
  return roomId ? (
    <Entry roomId={roomId} onChangeRoom={() => setRoomId(null)} />
  ) : (
    <Pick onPick={setRoomId} />
  );
}

function Pick({ onPick }: { onPick: (id: string) => void }) {
  const c = useColors();
  const q = useQuery({
    queryKey: ["meter-overview"],
    queryFn: () => api<{ properties: Prop[] }>("l/meter/overview"),
  });
  const [pid, setPid] = useState<string | null>(null);
  const props = q.data?.properties ?? [];
  const sel = props.find((p) => p.id === (pid ?? (props.length === 1 ? props[0].id : null)));
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>1. Property chunein</Text>
      <ErrorText error={q.error} />
      {q.isLoading ? <SkeletonList n={2} height={70} /> : null}
      {q.data && !props.length ? (
        <Empty text="Pehle Rooms tab mein property aur room banayein." />
      ) : null}
      {props.map((p) => (
        <Pressable key={p.id} onPress={() => setPid(p.id)}>
          <Card
            style={{
              borderColor: sel?.id === p.id ? c.primary : c.border,
              borderWidth: sel?.id === p.id ? 2 : 1,
            }}
          >
            <Text style={{ color: c.text, fontWeight: "800" }}>{p.name}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {p.city ?? ""} · {p.rooms.length} rooms
            </Text>
          </Card>
        </Pressable>
      ))}
      {sel ? (
        <>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800", marginTop: 8 }}>
            2. Room chunein — {sel.name}
          </Text>
          {!sel.rooms.length ? <Empty text="Is property mein koi room nahi." /> : null}
          {sel.rooms.map((r) => (
            <Pressable key={r.id} onPress={() => onPick(r.id)}>
              <Card style={{ gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>
                    Room {r.number}
                  </Text>
                  {r.pending ? <Pill text={`${r.pending} approval baaki`} tone="warn" /> : null}
                </View>
                <Text style={{ color: c.muted, fontSize: 13 }}>
                  {r.tenants.length ? r.tenants.join(", ") : "Koi tenant nahi"}
                </Text>
                <Text style={{ color: c.text, fontSize: 13 }}>
                  Pichli reading:{" "}
                  <Text style={{ fontWeight: "800" }}>
                    {r.last ? `${r.last.reading} (${dmy(r.last.date)})` : "abhi tak koi nahi"}
                  </Text>
                </Text>
              </Card>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function Entry({ roomId, onChangeRoom }: { roomId: string; onChangeRoom: () => void }) {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["meter-ctx", roomId],
    queryFn: () => api<Ctx>("l/meter/context", { room_id: roomId }),
    gcTime: 0,
  });
  const [raw, setRaw] = useState("");
  const [date, setDate] = useState(d2(new Date()));
  const [pick, setPick] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmHigh, setConfirmHigh] = useState(false);
  const [photo, setPhoto] = useState<{
    uri: string;
    b64: string;
    lat?: number;
    lng?: number;
  } | null>(null);
  const [ocr, setOcr] = useState(false);
  const [ocrNote, setOcrNote] = useState("");
  const d = q.data;
  const chk = useMemo(
    () =>
      checkMeterReading({
        raw,
        prev: d?.last?.reading ?? null,
        date,
        today: d2(new Date()),
        existingDates: d?.existingDates ?? [],
        typicalDelta: d?.typicalDelta ?? null,
        reason,
        confirmHigh,
      }),
    [raw, d, date, reason, confirmHigh],
  );

  const snap = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") return Alert.alert("Camera permission chahiye");
    const r = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      mediaTypes: ["images"],
    });
    if (!r.canceled && r.assets[0]?.base64) {
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const lp = await Location.requestForegroundPermissionsAsync();
        if (lp.status === "granted") {
          const pos = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = pos.coords.latitude;
          lng = pos.coords.longitude;
        }
      } catch {
        /* location is optional */
      }
      setPhoto({ uri: r.assets[0].uri, b64: r.assets[0].base64, lat, lng });
    }
  };
  const runOcr = useMutation({
    mutationFn: () =>
      api<{ reading: number | null; note: string }>("l/meter/ocr", { image_base64: photo?.b64 }),
    onSuccess: (r) => {
      setOcrNote(r.note);
      if (r.reading != null) {
        setRaw(String(r.reading));
        setOcr(true);
      } else setOcrNote("Photo se number nahi padha ja saka. Haath se likhein.");
    },
  });
  const save = useMutation({
    mutationFn: async () => {
      let photo_path: string | null = null;
      if (photo) {
        const { data: u } = await supabase.auth.getUser();
        const uid = u.user?.id;
        if (!uid) throw new Error("Please sign in again.");
        const path = `${uid}/${roomId}/${Date.now()}.jpg`;
        const bin = Uint8Array.from(atob(photo.b64), (ch) => ch.charCodeAt(0));
        const { error } = await supabase.storage
          .from("meter-photos")
          .upload(path, bin, { contentType: "image/jpeg" });
        if (error)
          throw new Error("Photo upload nahi hui. Internet check karke dobara try karein.");
        photo_path = path;
      }
      return api("l/meter/add", {
        room_id: roomId,
        reading: raw.trim(),
        date,
        reason,
        confirm_high: confirmHigh,
        photo_path,
        photo_lat: photo?.lat,
        photo_lng: photo?.lng,
        ai_detected: ocr,
      });
    },
    onSuccess: () => {
      for (const k of ["meter-overview", "meters", "home"]) qc.invalidateQueries({ queryKey: [k] });
      router.back();
    },
  });

  if (!d)
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <ErrorText error={q.error} />
        {q.isLoading ? <SkeletonList n={2} height={120} /> : null}
      </ScrollView>
    );
  const cur = chk.value;
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={{ backgroundColor: c.soft, borderColor: c.primary, gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>Aap is room ki reading daal rahe hain</Text>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>
          {d.property} · Room {d.room}
        </Text>
        <Text style={{ color: c.text }}>
          Tenant:{" "}
          <Text style={{ fontWeight: "700" }}>
            {d.tenants.length ? d.tenants.join(", ") : "koi nahi"}
          </Text>
        </Text>
        <Pressable onPress={onChangeRoom}>
          <Text style={{ color: c.primary, fontWeight: "700", marginTop: 2 }}>
            Room galat hai? Badlein →
          </Text>
        </Pressable>
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <Card style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.muted, fontSize: 12 }}>Pichli approved reading</Text>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>
            {d.last ? d.last.reading : "—"}
          </Text>
          <Text style={{ color: c.muted, fontSize: 11 }}>
            {d.last ? dmy(d.last.date) : "Pehli reading"}
          </Text>
        </Card>
        <Card
          style={{
            flex: 1,
            gap: 2,
            borderColor: chk.errors.length ? c.danger : chk.warnings.length ? c.warn : c.border,
          }}
        >
          <Text style={{ color: c.muted, fontSize: 12 }}>Nayi reading</Text>
          <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{cur ?? "—"}</Text>
          <Text style={{ color: c.muted, fontSize: 11 }}>
            {chk.delta != null ? `${chk.delta >= 0 ? "+" : ""}${chk.delta} unit` : " "}
          </Text>
        </Card>
      </View>

      <Field
        label="Meter ki reading"
        required
        value={raw}
        onChange={(v) => {
          setRaw(v);
          setOcr(false);
          setConfirmHigh(false);
        }}
        keyboard="numeric"
        placeholder="jaise 12345.6"
      />
      <Card style={{ gap: 3 }}>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 13 }}>
          Decimal kaise likhein?
        </Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Zyada tar meter mein 5 kaale digit + 1 laal (red) digit hota hai. Laal digit ek decimal
          hai: kaale 12345 aur laal 6 ho to{" "}
          <Text style={{ fontWeight: "800", color: c.text }}>12345.6</Text> likhein. Comma (,) kabhi
          na lagayein.
        </Text>
      </Card>

      {chk.errors.map((e) => (
        <Text key={e} style={{ color: c.danger, fontSize: 13 }}>
          ⛔ {e}
        </Text>
      ))}
      {chk.warnings.map((w) => (
        <Text key={w} style={{ color: c.warn, fontSize: 13 }}>
          ⚠ {w}
        </Text>
      ))}

      {chk.needsReason ? (
        <Field
          label="Kam reading ki wajah"
          required
          value={reason}
          onChange={setReason}
          multiline
          placeholder="Meter badla gaya / reset hua…"
          hint="Ye record mein 'Exception' ke taur par save hoga."
        />
      ) : null}
      {chk.needsConfirmHigh ? (
        <Pressable
          onPress={() => setConfirmHigh((x) => !x)}
          style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
        >
          <Ionicons
            name={confirmHigh ? "checkbox" : "square-outline"}
            size={24}
            color={confirmHigh ? c.primary : c.muted}
          />
          <Text style={{ color: c.text, flex: 1 }}>
            Haan, maine meter dobara dekha — ye reading sahi hai.
          </Text>
        </Pressable>
      ) : null}

      <Pressable
        onPress={() => setPick(true)}
        style={{
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: R.m,
          padding: 12,
        }}
      >
        <Text style={{ color: c.muted, fontSize: 12 }}>Reading ki date</Text>
        <Text style={{ color: c.text, fontWeight: "600" }}>{dmy(date)}</Text>
      </Pressable>
      {pick ? (
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          maximumDate={new Date()}
          onChange={(e, v) => {
            setPick(Platform.OS === "ios");
            if (e.type !== "dismissed" && v) setDate(d2(v));
          }}
        />
      ) : null}

      <Button
        kind="ghost"
        title={photo ? "📷 Photo dobara kheenchein" : "📷 Meter ki photo kheenchein (optional)"}
        onPress={snap}
      />
      {photo ? (
        <>
          <Image
            source={{ uri: photo.uri }}
            resizeMode="contain"
            style={{ width: "100%", height: 200, borderRadius: 12, backgroundColor: c.border }}
          />
          <Button
            kind="ghost"
            title="Photo se number padhein (OCR)"
            busy={runOcr.isPending}
            onPress={() => runOcr.mutate()}
          />
          <ErrorText error={runOcr.error} />
          {ocrNote ? <Text style={{ color: c.muted, fontSize: 12 }}>{ocrNote}</Text> : null}
        </>
      ) : null}

      <ErrorText error={save.error} />
      <Button
        title="Reading save karein"
        busy={save.isPending}
        disabled={!chk.ok}
        onPress={() => save.mutate()}
      />

      <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 8 }}>
        Is room ki history
      </Text>
      {!d.readings.length && !d.submissions.length ? <Empty text="Abhi koi reading nahi." /> : null}
      {d.readings.map((r) => (
        <Card key={r.id} style={{ gap: 2 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>{r.reading}</Text>
            <View style={{ flexDirection: "row", gap: 6 }}>
              {r.exception ? <Pill text="Exception" tone="warn" /> : null}
              {r.ocr ? <Pill text="OCR" tone="muted" /> : null}
              <Pill text="Approved" tone="ok" />
            </View>
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {dmy(r.date)}
            {r.usage != null ? ` · ${r.usage} unit use` : ""}
          </Text>
        </Card>
      ))}
      {d.submissions
        .filter((s) => s.status !== "approved")
        .map((s) => (
          <Card key={s.id} style={{ gap: 2 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "800" }}>
                {s.reading}{" "}
                <Text style={{ color: c.muted, fontWeight: "400", fontSize: 12 }}>
                  ({s.tenant ?? "tenant"})
                </Text>
              </Text>
              <Pill
                text={s.status === "pending" ? "Pending" : "Rejected"}
                tone={s.status === "pending" ? "warn" : "danger"}
              />
            </View>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {dmy(s.date)}
              {s.note ? ` · ${s.note}` : ""}
            </Text>
          </Card>
        ))}
    </ScrollView>
  );
}
