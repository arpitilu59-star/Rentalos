import React from "react";
import { FlatList, Share, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, inr } from "@/theme";

type Bill = { id: string; total_amount: number; amount_paid: number | null; status: string; due_date: string; rent_period_start: string; rent_period_end: string;
  rent_amount: number; electricity_amount: number | null; water_amount: number | null; other_charges: number; previous_dues: number; units_consumed: number | null; rooms: { room_number: string } | null };
const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });

export default function Bills() {
  const c = useColors();
  const router = useRouter();
  const q = useQuery({ queryKey: ["bills"], queryFn: () => api<{ bills: Bill[]; outstanding: number }>("bills") });
  const line = (k: string, v: number | null | undefined) => (v ? <View style={{ flexDirection: "row", justifyContent: "space-between" }}><Text style={{ color: c.muted }}>{k}</Text><Text style={{ color: c.text }}>{inr(v)}</Text></View> : null);
  return (
    <FlatList
      data={q.data?.bills ?? []} keyExtractor={(b) => b.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshing={q.isRefetching} onRefresh={() => q.refetch()}
      ListHeaderComponent={<View style={{ gap: 8 }}><ErrorText error={q.error} />
        {q.data && <Card style={{ backgroundColor: q.data.outstanding > 0 ? c.soft : c.card }}><Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>TOTAL OUTSTANDING</Text><Text style={{ color: c.text, fontSize: 32, fontWeight: "800" }}>{inr(q.data.outstanding)}</Text></Card>}</View>}
      ListEmptyComponent={<Empty text={q.isLoading ? "Loading…" : "Koi bill nahi hai."} />}
      renderItem={({ item: b }) => {
        const due = Math.max(0, b.total_amount - (b.amount_paid ?? 0));
        const paid = due <= 0 || b.status === "paid";
        return (
          <Card style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "700" }}>{d(b.rent_period_start)} – {d(b.rent_period_end)}</Text>
              <Text style={{ color: paid ? c.primary : c.warn, fontWeight: "800" }}>{paid ? "PAID" : "DUE"}</Text>
            </View>
            {line("Rent", b.rent_amount)}{line(`Electricity${b.units_consumed ? ` (${b.units_consumed} units)` : ""}`, b.electricity_amount)}
            {line("Water", b.water_amount)}{line("Other", b.other_charges)}{line("Previous dues", b.previous_dues)}
            <View style={{ flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: c.border, paddingTop: 6, marginTop: 2 }}>
              <Text style={{ color: c.text, fontWeight: "800" }}>Total</Text><Text style={{ color: c.text, fontWeight: "800" }}>{inr(b.total_amount)}</Text>
            </View>
            {!paid && <Text style={{ color: c.muted }}>Baaki {inr(due)} · due {d(b.due_date)}</Text>}
            <View style={{ flexDirection: "row", gap: 8, marginTop: 6 }}>
              {!paid && <Button title="Pay now" style={{ flex: 1 }} onPress={() => router.push({ pathname: "/pay/[billId]", params: { billId: b.id } })} />}
              <Button kind="ghost" title="Share" style={{ flex: 1 }} onPress={() => Share.share({ message: `Rentalos bill ${d(b.rent_period_start)}–${d(b.rent_period_end)}: total ${inr(b.total_amount)}, ${paid ? "paid" : `baaki ${inr(due)}`}.` })} />
            </View>
          </Card>
        );
      }}
    />
  );
}
