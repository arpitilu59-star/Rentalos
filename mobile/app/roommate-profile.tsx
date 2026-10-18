import React, { useEffect, useState } from "react";
import { ScrollView, Switch, View } from "react-native";
import { Text, TextInput } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { Button, Chip, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

export default function RoommateProfile() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["rm-profile"], queryFn: () => api<{ profile: Record<string, any> | null }>("roommate-profile") });
  const [f, setF] = useState<Record<string, any>>({ looking_for_roommate: true, smoking: false });
  useEffect(() => { if (q.data?.profile) setF({ ...q.data.profile }); }, [q.data]);
  const set = (k: string, v: unknown) => setF((p) => ({ ...p, [k]: v }));
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^0-9]/g, "")));
  const save = useMutation({
    mutationFn: () => api("roommate-profile", { save: true, ...f, age: f.age ?? null }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["matches"] }); qc.invalidateQueries({ queryKey: ["rm-profile"] }); router.back(); },
  });
  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;
  const L = (t: string) => <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>{t}</Text>;
  const row = (children: React.ReactNode) => <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>{children}</View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>Roommate dhoondh raha/rahi hu</Text>
        <Switch value={!!f.looking_for_roommate} onValueChange={(v) => set("looking_for_roommate", v)} trackColor={{ true: c.primary }} />
      </View>
      {L("NAME (dusron ko dikhega)")}<TextInput style={input} value={f.display_name ?? ""} onChangeText={(v) => set("display_name", v)} placeholder="First name" placeholderTextColor={c.muted} />
      {L("AGE")}<TextInput style={input} keyboardType="number-pad" value={f.age ? String(f.age) : ""} onChangeText={(v) => set("age", num(v))} placeholderTextColor={c.muted} />
      {L("GENDER")}{row(["male", "female", "other"].map((g) => <Chip key={g} label={g} active={f.gender === g} onPress={() => set("gender", g)} />))}
      {L("CITY")}<TextInput style={input} value={f.city ?? ""} onChangeText={(v) => set("city", v)} placeholder="e.g. Jaipur" placeholderTextColor={c.muted} />
      {L("OCCUPATION")}<TextInput style={input} value={f.occupation ?? ""} onChangeText={(v) => set("occupation", v)} placeholder="Student / Software engineer…" placeholderTextColor={c.muted} />
      {L("SLEEP")}{row([["early_bird", "Early bird"], ["night_owl", "Night owl"]].map(([k, l]) => <Chip key={k} label={l} active={f.sleep_schedule === k} onPress={() => set("sleep_schedule", k)} />))}
      {L("FOOD")}{row([["veg", "Veg"], ["non_veg", "Non-veg"], ["vegan", "Vegan"]].map(([k, l]) => <Chip key={k} label={l} active={f.diet === k} onPress={() => set("diet", k)} />))}
      {L("SMOKING")}{row([[false, "Non-smoker"], [true, "Smoker"]].map(([k, l]) => <Chip key={String(k)} label={String(l)} active={f.smoking === k} onPress={() => set("smoking", k)} />))}
      {L("BUDGET (₹ / month)")}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <TextInput style={[input, { flex: 1 }]} keyboardType="number-pad" placeholder="Min" placeholderTextColor={c.muted} value={f.budget_min != null ? String(f.budget_min) : ""} onChangeText={(v) => set("budget_min", num(v))} />
        <TextInput style={[input, { flex: 1 }]} keyboardType="number-pad" placeholder="Max" placeholderTextColor={c.muted} value={f.budget_max != null ? String(f.budget_max) : ""} onChangeText={(v) => set("budget_max", num(v))} />
      </View>
      {L("ABOUT YOU (max 300)")}<TextInput style={[input, { height: 90, textAlignVertical: "top" }]} multiline maxLength={300} value={f.bio ?? ""} onChangeText={(v) => set("bio", v)} placeholderTextColor={c.muted} />
      <ErrorText error={save.error} />
      <Button title="Save" busy={save.isPending} onPress={() => save.mutate()} style={{ marginTop: 8 }} />
    </ScrollView>
  );
}
