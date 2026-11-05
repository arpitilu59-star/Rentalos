import React, { useState } from "react";
import { Alert, Platform, Pressable, RefreshControl, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Choice, Field, FilterRow } from "@/lib/ui2";
import { useColors, inr, dmy, R } from "@/theme";

const CATS: Array<[string, string]> = [
  ["repair", "Repair"],
  ["electricity", "Bijli bill"],
  ["water", "Paani"],
  ["salary", "Salary"],
  ["cleaning", "Safai"],
  ["internet", "Internet"],
  ["tax", "Tax"],
  ["other", "Other"],
];
type E = {
  id: string;
  category: string;
  amount: number;
  spent_on: string;
  note: string | null;
  properties: { name: string } | null;
};
const d2 = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

export default function Expenses() {
  const c = useColors();
  const qc = useQueryClient();
  const ym = d2(new Date()).slice(0, 7);
  const [month, setMonth] = useState<string>(ym);
  const [adding, setAdding] = useState(false);
  const [cat, setCat] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(d2(new Date()));
  const [pick, setPick] = useState(false);
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(new Date().getFullYear(), new Date().getMonth() - i, 1);
    return d2(d).slice(0, 7);
  });
  const q = useQuery({
    queryKey: ["expenses", month],
    queryFn: () =>
      api<{ expenses: E[]; total: number; by_category: Record<string, number> }>("l/expenses", {
        month,
      }),
  });
  const add = useMutation({
    mutationFn: () => api("l/expense/add", { category: cat, amount: amt, note, spent_on: date }),
    onSuccess: () => {
      setAdding(false);
      setCat(null);
      setAmt("");
      setNote("");
      for (const k of ["expenses", "reports"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const del = useMutation({
    mutationFn: (id: string) => api("l/expense/delete", { id }),
    onSuccess: () => {
      for (const k of ["expenses", "reports"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  const label = (k: string) => CATS.find(([x]) => x === k)?.[1] ?? k;
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <FilterRow
        value={month}
        onChange={setMonth}
        options={months.map((m) => [m, dmy(`${m}-01`).replace(/^\d+\s/, "")] as [string, string])}
      />
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>Is mahine ka kharcha</Text>
        <Text style={{ color: c.text, fontSize: 26, fontWeight: "800" }}>
          {inr(q.data?.total ?? 0)}
        </Text>
        {q.data
          ? Object.entries(q.data.by_category).map(([k, v]) => (
              <Text key={k} style={{ color: c.muted, fontSize: 12 }}>
                {label(k)}: {inr(v)}
              </Text>
            ))
          : null}
      </Card>
      {adding ? (
        <Card style={{ gap: 12 }}>
          <Choice label="Category" required value={cat} options={CATS} onChange={setCat} />
          <Field label="Amount (₹)" required value={amt} onChange={setAmt} keyboard="numeric" />
          <Pressable
            onPress={() => setPick(true)}
            style={{ borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12 }}
          >
            <Text style={{ color: c.muted, fontSize: 12 }}>Date</Text>
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
          <Field label="Note (optional)" value={note} onChange={setNote} maxLength={300} />
          <ErrorText error={add.error} />
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              kind="ghost"
              title="Cancel"
              onPress={() => setAdding(false)}
              style={{ flex: 1 }}
            />
            <Button
              title="Save"
              busy={add.isPending}
              disabled={!cat || !(Number(amt) > 0)}
              onPress={() => add.mutate()}
              style={{ flex: 1 }}
            />
          </View>
        </Card>
      ) : (
        <Button title="+ Kharcha daalein" onPress={() => setAdding(true)} />
      )}
      <ErrorText error={q.error ?? del.error} />
      {q.isLoading ? <SkeletonList n={3} height={64} /> : null}
      {q.data && !q.data.expenses.length ? <Empty text="Is mahine koi kharcha nahi." /> : null}
      {q.data?.expenses.map((e) => (
        <Card key={e.id} style={{ gap: 3 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text style={{ color: c.text, fontWeight: "700" }}>{label(e.category)}</Text>
            <Text style={{ color: c.text, fontWeight: "800" }}>{inr(e.amount)}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {dmy(e.spent_on)}
            {e.properties?.name ? ` · ${e.properties.name}` : ""}
            {e.note ? ` · ${e.note}` : ""}
          </Text>
          <Pressable
            onPress={() =>
              Alert.alert("Kharcha delete karein?", "", [
                { text: "Nahi" },
                { text: "Delete", style: "destructive", onPress: () => del.mutate(e.id) },
              ])
            }
          >
            <Text style={{ color: c.danger, fontSize: 12, fontWeight: "700" }}>Delete</Text>
          </Pressable>
        </Card>
      ))}
    </ScrollView>
  );
}
