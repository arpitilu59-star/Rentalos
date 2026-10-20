import React, { useState } from "react";
import { Platform, Pressable, ScrollView } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Choice, Field } from "@/lib/ui2";
import { useColors, R, dmy } from "@/theme";

type T = { id: string; name: string; active: boolean; rooms: { room_number: string } | null };
const d2 = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
const CHECKS: Array<[string, string]> = [
  ["walls", "Deewarein / paint theek"],
  ["fans_lights", "Fan, light, switch chalu"],
  ["bathroom", "Bathroom / tap theek"],
  ["furniture", "Furniture poora"],
  ["keys", "Chaabiyan di / li"],
  ["clean", "Room saaf"],
];

export default function MoveForm() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api<{ tenants: T[] }>("l/tenants"),
  });
  const [kind, setKind] = useState<"move_in" | "move_out">("move_in");
  const [tid, setTid] = useState<string | null>(null);
  const [date, setDate] = useState(d2(new Date()));
  const [pick, setPick] = useState(false);
  const [reading, setReading] = useState("");
  const [notes, setNotes] = useState("");
  const [chk, setChk] = useState<Record<string, boolean>>({});
  const save = useMutation({
    mutationFn: () =>
      api("l/move/create", {
        tenant_id: tid,
        kind,
        move_date: date,
        meter_reading: reading,
        condition_notes: notes,
        checklist: chk,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["moves"] });
      router.back();
    },
  });
  const opts = (tenants.data?.tenants ?? []).map(
    (t) =>
      [t.id, `${t.name} · ${t.rooms?.room_number ?? ""}${t.active ? "" : " (purana)"}`] as [
        string,
        string,
      ],
  );
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Choice
        label="Kya record karna hai"
        value={kind}
        options={[
          ["move_in", "Move-in"],
          ["move_out", "Move-out"],
        ]}
        onChange={setKind}
      />
      <Choice label="Tenant" required value={tid} options={opts} onChange={setTid} />
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
        <Text style={{ color: c.muted, fontSize: 12 }}>Date</Text>
        <Text style={{ color: c.text, fontWeight: "600" }}>{dmy(date)}</Text>
      </Pressable>
      {pick ? (
        <DateTimePicker
          value={new Date(date)}
          mode="date"
          onChange={(e, v) => {
            setPick(Platform.OS === "ios");
            if (e.type !== "dismissed" && v) setDate(d2(v));
          }}
        />
      ) : null}
      <Field label="Meter reading" value={reading} onChange={setReading} keyboard="numeric" />
      <Choice
        label="Room ki halat (tap karke tick)"
        value={null as string | null}
        options={CHECKS.map(([k, l]) => [k, `${chk[k] ? "✓ " : ""}${l}`] as [string, string])}
        onChange={(k) => setChk((x) => ({ ...x, [k]: !x[k] }))}
      />
      <Field
        label="Room ki condition ke notes"
        value={notes}
        onChange={setNotes}
        multiline
        maxLength={2000}
      />
      <ErrorText error={save.error} />
      <Button
        title="Record save karein"
        busy={save.isPending}
        disabled={!tid}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}
