import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Choice, Field, useUnsavedGuard } from "@/lib/ui2";
import { useColors, R, dmy } from "@/theme";

type Prop = {
  id: string;
  name: string;
  rooms: Array<{
    id: string;
    room_number: string;
    rent_amount: number;
    capacity: number;
    occupied: number;
  }>;
};
type T = {
  id: string;
  name: string;
  phone: string | null;
  email?: string | null;
  persons?: number;
  gender?: string | null;
  move_in_date: string | null;
  rent_share: number | null;
  initial_reading?: number | null;
  rooms: { room_number: string } | null;
};
const d2 = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

export default function TenantForm() {
  const c = useColors();
  const router = useRouter();
  const guard = useUnsavedGuard();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const props = useQuery({
    queryKey: ["props"],
    queryFn: () => api<{ properties: Prop[] }>("l/properties"),
  });
  const list = useQuery({
    queryKey: ["tenants"],
    queryFn: () =>
      api<{ tenants: Array<T & { rooms: { id: string; room_number: string } | null }> }>(
        "l/tenants",
      ),
  });
  const initial = list.data?.tenants.find((t) => t.id === id);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [room, setRoom] = useState<string | null>(null);
  const [rent, setRent] = useState("");
  const [persons, setPersons] = useState("1");
  const [gender, setGender] = useState<string | null>(null);
  const [reading, setReading] = useState("");
  const [moveIn, setMoveIn] = useState(d2(new Date()));
  const [pick, setPick] = useState(false);
  useEffect(() => {
    if (!initial) return;
    setName(initial.name);
    setPhone(initial.phone ?? "");
    setEmail(initial.email ?? "");
    setRoom(initial.rooms?.id ?? null);
    setRent(initial.rent_share != null ? String(initial.rent_share) : "");
    setPersons(String(initial.persons ?? 1));
    setGender(initial.gender ?? null);
    setReading(initial.initial_reading ? String(initial.initial_reading) : "");
    if (initial.move_in_date) setMoveIn(initial.move_in_date.slice(0, 10));
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const rooms = (props.data?.properties ?? []).flatMap((p) =>
    p.rooms.map((r) => ({
      ...r,
      label: `${p.name} · ${r.room_number}${r.occupied >= r.capacity ? " (full)" : ""}`,
    })),
  );
  const save = useMutation({
    mutationFn: () =>
      api("l/tenant/save", {
        id,
        name,
        phone,
        email,
        room_id: room,
        rent_share: rent,
        persons,
        gender,
        initial_reading: reading,
        move_in_date: moveIn,
      }),
    onSuccess: () => {
      guard.clear();
      for (const k of ["tenants", "props", "home"]) qc.invalidateQueries({ queryKey: [k] });
      router.back();
    },
  });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Field label="Tenant ka naam" value={name} onChange={guard.wrap(setName)} required />
      <Choice
        label="Gender"
        value={gender}
        onChange={guard.wrap(setGender)}
        options={[
          ["male", "Male"],
          ["female", "Female"],
          ["other", "Other"],
        ]}
        hint="Boys/Girls rooms mein sahi gender zaroori hai."
      />
      <Field
        label="Mobile number"
        value={phone}
        onChange={guard.wrap(setPhone)}
        keyboard="phone-pad"
        required
        hint="Isi number/email se tenant Rentalos app mein apna room dekh paata hai."
      />
      <Field
        label="Email (optional)"
        value={email}
        onChange={guard.wrap(setEmail)}
        keyboard="email-address"
      />
      <Choice
        label="Room"
        required
        value={room}
        options={rooms.map((r) => [r.id, r.label] as [string, string])}
        onChange={(v) => {
          guard.mark();
          setRoom(v);
          const r = rooms.find((x) => x.id === v);
          if (r && !rent) setRent(String(r.rent_amount));
        }}
      />
      <Field
        label="Rent (₹ / mahina)"
        value={rent}
        onChange={guard.wrap(setRent)}
        keyboard="numeric"
        hint="Khali chhodein to room ka rent lagega."
      />
      <Field
        label="Kitne log"
        value={persons}
        onChange={guard.wrap(setPersons)}
        keyboard="numeric"
      />
      <Field
        label="Move-in ke time meter reading"
        value={reading}
        onChange={guard.wrap(setReading)}
        keyboard="numeric"
      />
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
        <Text style={{ color: c.muted, fontSize: 12 }}>Move-in date</Text>
        <Text style={{ color: c.text, fontWeight: "600" }}>{dmy(moveIn)}</Text>
      </Pressable>
      {pick ? (
        <DateTimePicker
          value={new Date(moveIn)}
          mode="date"
          onChange={(e, v) => {
            setPick(Platform.OS === "ios");
            if (e.type !== "dismissed" && v) {
              guard.mark();
              setMoveIn(d2(v));
            }
          }}
        />
      ) : null}
      <ErrorText error={save.error} />
      <Button
        title="Save karein"
        busy={save.isPending}
        disabled={!name.trim() || !phone.trim() || !room}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}
