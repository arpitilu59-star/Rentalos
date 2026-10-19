import React, { useEffect, useState } from "react";
import { Platform, Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Field } from "@/lib/ui2";
import { useColors, R, inr, dmy } from "@/theme";

type D = {
  tenant: { id: string; name: string }; room: string; rent_period_start: string; rent_period_end: string; elec_period_start: string; elec_period_end: string; due_date: string;
  rent_amount: number; prev_reading: number; curr_reading: number; electricity_per_unit: number; persons: number; water_per_person: number; cleaning_amount: number; previous_dues: number;
};
const d2 = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

/** Same maths as the web "Generate bill"; meter reading starts from the latest APPROVED reading. */
export default function BillNew() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { tenant_id } = useLocalSearchParams<{ tenant_id: string }>();
  const q = useQuery({ queryKey: ["bill-draft", tenant_id], queryFn: () => api<D>("l/bill/draft", { tenant_id }), gcTime: 0 });
  const [f, setF] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    const d = q.data; if (!d) return;
    setF({
      rent_period_start: d.rent_period_start, rent_period_end: d.rent_period_end, elec_period_start: d.elec_period_start, elec_period_end: d.elec_period_end, due_date: d.due_date,
      rent_amount: String(d.rent_amount), prev_reading: String(d.prev_reading), curr_reading: String(d.curr_reading), electricity_per_unit: String(d.electricity_per_unit),
      persons: String(d.persons), water_per_person: String(d.water_per_person), cleaning_amount: String(d.cleaning_amount), other_charges: "0", other_charges_note: "", previous_dues: String(d.previous_dues),
    });
  }, [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const n = (k: string) => Math.max(0, Number(f[k]) || 0);
  const units = Math.max(0, n("curr_reading") - n("prev_reading"));
  const elec = units * n("electricity_per_unit");
  const water = Math.max(1, n("persons")) * n("water_per_person");
  const total = n("rent_amount") + elec + water + n("cleaning_amount") + n("other_charges") + n("previous_dues");
  const save = useMutation({
    mutationFn: () => api("l/bill/create", { tenant_id, ...f }),
    onSuccess: () => { for (const k of ["bills", "home", "tenants"]) qc.invalidateQueries({ queryKey: [k] }); router.back(); },
  });
  const dateBtn = (k: string, label: string) => (
    <Pressable key={k} onPress={() => setPick(k)} style={{ flex: 1, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 11 }}>
      <Text style={{ color: c.muted, fontSize: 11 }}>{label}</Text><Text style={{ color: c.text, fontWeight: "600" }}>{dmy(f[k])}</Text>
    </Pressable>
  );
  if (!q.data) return <Text style={{ color: c.muted, padding: 20 }}>{q.error ? (q.error as Error).message : "Loading…"}</Text>;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>{q.data.tenant.name} · Room {q.data.room}</Text>
      <Text style={{ color: c.muted, fontSize: 12 }}>Rent period</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{dateBtn("rent_period_start", "Se")}{dateBtn("rent_period_end", "Tak")}</View>
      <Text style={{ color: c.muted, fontSize: 12 }}>Bijli period</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>{dateBtn("elec_period_start", "Se")}{dateBtn("elec_period_end", "Tak")}</View>
      <View style={{ flexDirection: "row", gap: 8 }}>{dateBtn("due_date", "Last date")}</View>
      {pick ? <DateTimePicker value={new Date(f[pick] ?? Date.now())} mode="date" onChange={(e, v) => { setPick(Platform.OS === "ios" ? pick : null); if (e.type !== "dismissed" && v) set(pick)(d2(v)); }} /> : null}
      <Field label="Rent (₹)" value={f.rent_amount ?? ""} onChange={set("rent_amount")} keyboard="numeric" />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Pichli reading" value={f.prev_reading ?? ""} onChange={set("prev_reading")} keyboard="numeric" /></View>
        <View style={{ flex: 1 }}><Field label="Abhi ki reading" value={f.curr_reading ?? ""} onChange={set("curr_reading")} keyboard="numeric" /></View>
      </View>
      <Field label="Bijli rate (₹ / unit)" value={f.electricity_per_unit ?? ""} onChange={set("electricity_per_unit")} keyboard="numeric" hint="Reading wahi dikhti hai jo aapne approve ki hai." />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <View style={{ flex: 1 }}><Field label="Log" value={f.persons ?? ""} onChange={set("persons")} keyboard="numeric" /></View>
        <View style={{ flex: 1 }}><Field label="Paani / person (₹)" value={f.water_per_person ?? ""} onChange={set("water_per_person")} keyboard="numeric" /></View>
      </View>
      <Field label="Safai (₹)" value={f.cleaning_amount ?? ""} onChange={set("cleaning_amount")} keyboard="numeric" />
      <Field label="Pichla baaki (₹)" value={f.previous_dues ?? ""} onChange={set("previous_dues")} keyboard="numeric" />
      <Field label="Extra charges (₹)" value={f.other_charges ?? ""} onChange={set("other_charges")} keyboard="numeric" />
      <Field label="Extra charges ka note" value={f.other_charges_note ?? ""} onChange={set("other_charges_note")} />
      <Card style={{ gap: 3 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>Bijli: {units} unit × {inr(n("electricity_per_unit"))} = {inr(elec)}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>Paani: {inr(water)}</Text>
        <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>Total {inr(total)}</Text>
      </Card>
      <ErrorText error={save.error} />
      <Button title="Bill banayein" busy={save.isPending} onPress={() => save.mutate()} />
    </ScrollView>
  );
}
