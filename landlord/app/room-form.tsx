import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Choice, Field } from "@/lib/ui2";

const OCC: Array<[string, string]> = [["boys", "Boys only"], ["girls", "Girls only"], ["family", "Family"], ["anyone", "Anyone"]];
const SIZES: Array<[string, string]> = [["single_room", "Single room"], ["shared_room", "Shared room"], ["1rk", "1 RK"], ["1bhk", "1 BHK"], ["2bhk", "2 BHK"], ["3bhk", "3 BHK"], ["4bhk_plus", "4+ BHK"]];
type R = { id: string; room_number: string; rent_amount: number; capacity: number; occupant_type: string | null; room_size: string | null };
type P = { id: string; rooms: R[] };

export default function RoomForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const { property_id, id } = useLocalSearchParams<{ property_id: string; id?: string }>();
  const props = useQuery({ queryKey: ["props"], queryFn: () => api<{ properties: P[] }>("l/properties") });
  const initial = props.data?.properties.flatMap((p) => p.rooms).find((r) => r.id === id);
  const [number, setNumber] = useState(""); const [rent, setRent] = useState(""); const [cap, setCap] = useState("1");
  const [occ, setOcc] = useState<string | null>(null); const [size, setSize] = useState<string | null>(null);
  useEffect(() => {
    if (initial) { setNumber(initial.room_number); setRent(String(initial.rent_amount)); setCap(String(initial.capacity)); setOcc(initial.occupant_type); setSize(initial.room_size); }
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: () => api<{ id: string }>("l/room/save", { id, property_id, room_number: number, rent_amount: rent, capacity: cap, occupant_type: occ, room_size: size }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["props"] }); qc.invalidateQueries({ queryKey: ["home"] });
      // New room → go straight into the listing checklist so nothing is forgotten.
      if (id) router.back(); else router.replace(`/listing/${r.id}` as never);
    },
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Field label="Room number / naam" value={number} onChange={setNumber} required placeholder="101" />
      <Field label="Rent (₹ / mahina)" value={rent} onChange={setRent} keyboard="numeric" required />
      <Field label="Tenant slots (beds)" value={cap} onChange={setCap} keyboard="numeric" hint="Sharing room mein jitne log rah sakte hain." />
      <Choice label="Kis ke liye" required value={occ} options={OCC} onChange={setOcc} />
      <Choice label="Room size" required value={size} options={SIZES} onChange={setSize} />
      <ErrorText error={save.error} />
      <Button title={id ? "Save karein" : "Room banayein aur details bharein"} busy={save.isPending} disabled={!number.trim() || !(Number(rent) > 0)} onPress={() => save.mutate()} />
    </ScrollView>
  );
}
