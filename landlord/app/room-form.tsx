import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Switch, View } from "react-native";
import { Text } from "@/components/Text";
import { useColors } from "@/theme";
import { Choice, Field, useUnsavedGuard } from "@/lib/ui2";

const OCC: Array<[string, string]> = [
  ["boys", "Boys only"],
  ["girls", "Girls only"],
  ["family", "Family"],
  ["anyone", "Anyone"],
];
const SIZES: Array<[string, string]> = [
  ["single_room", "Single room"],
  ["shared_room", "Shared room"],
  ["1rk", "1 RK"],
  ["1bhk", "1 BHK"],
  ["2bhk", "2 BHK"],
  ["3bhk", "3 BHK"],
  ["4bhk_plus", "4+ BHK"],
];
type R = {
  id: string;
  room_number: string;
  rent_amount: number;
  capacity: number;
  occupant_type: string | null;
  room_size: string | null;
  parking_kind?: string | null;
  parking_vehicle?: string | null;
  parking_covered?: boolean | null;
  parking_reserved?: boolean | null;
  parking_paid?: boolean | null;
  parking_distance_m?: number | null;
  parking_notes?: string | null;
};
const PARK: Array<[string, string]> = [
  ["dedicated", "Dedicated slot (is room ka)"],
  ["shared", "Shared (building ka)"],
  ["nearby", "Nearby (bahar, paas mein)"],
  ["street", "Street parking"],
  ["none", "Parking nahi hai"],
];
const VEH: Array<[string, string]> = [
  ["two_wheeler", "2-wheeler"],
  ["four_wheeler", "4-wheeler"],
  ["both", "Dono"],
];
type P = { id: string; rooms: R[] };

export default function RoomForm() {
  const router = useRouter();
  const guard = useUnsavedGuard();
  const qc = useQueryClient();
  const { property_id, id } = useLocalSearchParams<{ property_id: string; id?: string }>();
  const props = useQuery({
    queryKey: ["props"],
    queryFn: () => api<{ properties: P[] }>("l/properties"),
  });
  const initial = props.data?.properties.flatMap((p) => p.rooms).find((r) => r.id === id);
  const [number, setNumber] = useState("");
  const [rent, setRent] = useState("");
  const [cap, setCap] = useState("1");
  const [occ, setOcc] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const c = useColors();
  const [pk, setPk] = useState<string | null>(null);
  const [pv, setPv] = useState<string | null>(null);
  const [pCovered, setPCovered] = useState(false);
  const [pReserved, setPReserved] = useState(false);
  const [pPaid, setPPaid] = useState(false);
  const [pDist, setPDist] = useState("");
  const [pNotes, setPNotes] = useState("");
  useEffect(() => {
    if (initial) {
      setNumber(initial.room_number);
      setRent(String(initial.rent_amount));
      setCap(String(initial.capacity));
      setOcc(initial.occupant_type);
      setSize(initial.room_size);
      setPk(
        initial.parking_kind && initial.parking_kind !== "unspecified"
          ? initial.parking_kind
          : null,
      );
      setPv(initial.parking_vehicle ?? null);
      setPCovered(!!initial.parking_covered);
      setPReserved(!!initial.parking_reserved);
      setPPaid(!!initial.parking_paid);
      setPDist(initial.parking_distance_m != null ? String(initial.parking_distance_m) : "");
      setPNotes(initial.parking_notes ?? "");
    }
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () =>
      api<{ id: string }>("l/room/save", {
        id,
        property_id,
        room_number: number,
        rent_amount: rent,
        capacity: cap,
        occupant_type: occ,
        room_size: size,
        parking_kind: pk ?? "unspecified",
        parking_vehicle: pv,
        parking_covered: pCovered,
        parking_reserved: pReserved,
        parking_paid: pPaid,
        parking_distance_m: pDist,
        parking_notes: pNotes,
      }),
    onSuccess: (r) => {
      guard.clear();
      qc.invalidateQueries({ queryKey: ["props"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      // New room → go straight into the listing checklist so nothing is forgotten.
      if (id) router.back();
      else router.replace(`/listing/${r.id}` as never);
    },
  });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Field
        label="Room number / naam"
        value={number}
        onChange={guard.wrap(setNumber)}
        required
        placeholder="101"
      />
      <Field
        label="Rent (₹ / mahina)"
        value={rent}
        onChange={guard.wrap(setRent)}
        keyboard="numeric"
        required
      />
      <Field
        label="Tenant slots (beds)"
        value={cap}
        onChange={guard.wrap(setCap)}
        keyboard="numeric"
        hint="Sharing room mein jitne log rah sakte hain."
      />
      <Choice
        label="Kis ke liye"
        required
        value={occ}
        options={OCC}
        onChange={guard.wrap(setOcc)}
      />
      <Choice
        label="Room size"
        required
        value={size}
        options={SIZES}
        onChange={guard.wrap(setSize)}
      />
      <Choice
        label="Parking"
        value={pk}
        options={PARK}
        onChange={guard.wrap(setPk)}
        hint="Street ya nearby parking ko 'landlord ka slot' nahi dikhaya jata."
      />
      {pk && pk !== "none" ? (
        <>
          <Choice label="Gaadi ka type" value={pv} options={VEH} onChange={guard.wrap(setPv)} />
          {pk === "dedicated" || pk === "shared" ? (
            <>
              <Sw label="Covered hai" v={pCovered} set={guard.wrap(setPCovered)} c={c} />
              <Sw label="Reserved hai" v={pReserved} set={guard.wrap(setPReserved)} c={c} />
            </>
          ) : null}
          <Sw label="Parking ka alag charge lagta hai" v={pPaid} set={guard.wrap(setPPaid)} c={c} />
          {pk === "nearby" ? (
            <Field
              label="Doori (meter)"
              value={pDist}
              onChange={guard.wrap(setPDist)}
              keyboard="numeric"
              required
              hint="0 se 5000 meter"
            />
          ) : null}
          <Field
            label="Parking notes"
            value={pNotes}
            onChange={guard.wrap(setPNotes)}
            maxLength={200}
          />
        </>
      ) : null}
      <ErrorText error={save.error} />
      <Button
        title={id ? "Save karein" : "Room banayein aur details bharein"}
        busy={save.isPending}
        disabled={!number.trim() || !(Number(rent) > 0)}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}

function Sw({
  label,
  v,
  set,
  c,
}: {
  label: string;
  v: boolean;
  set: (b: boolean) => void;
  c: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ color: c.text }}>{label}</Text>
      <Switch value={v} onValueChange={set} />
    </View>
  );
}
