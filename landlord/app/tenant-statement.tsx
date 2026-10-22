import React from "react";
import { ScrollView, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Pill, Row } from "@/lib/ui2";
import { useColors, inr, dmy } from "@/theme";

type S = {
  tenant: {
    name: string;
    phone: string | null;
    active: boolean;
    rooms: { room_number: string } | null;
  };
  bills: Array<{
    id: string;
    rent_period_start: string | null;
    due_date: string | null;
    total_amount: number;
    amount_paid: number;
    status: string;
  }>;
  billed: number;
  paid: number;
  due: number;
};

export default function TenantStatement() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const router = useRouter();
  const q = useQuery({
    queryKey: ["statement", id],
    queryFn: () => api<S>("l/tenant/statement", { tenant_id: id }),
  });
  if (q.isLoading) return <SkeletonList n={3} height={80} />;
  if (!q.data)
    return (
      <View style={{ padding: 16 }}>
        <ErrorText error={q.error} />
      </View>
    );
  const d = q.data;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 17 }}>
          {d.tenant.name} · Room {d.tenant.rooms?.room_number ?? "—"}
        </Text>
        <Row k="Total billed" v={inr(d.billed)} />
        <Row k="Total mila" v={inr(d.paid)} />
        <Row
          k="Baaki"
          v={
            <Text style={{ color: d.due > 0 ? c.danger : c.ok, fontWeight: "800" }}>
              {inr(d.due)}
            </Text>
          }
        />
      </Card>
      {!d.bills.length ? <Empty text="Abhi tak koi bill nahi." /> : null}
      {d.bills.map((b) => (
        <Card key={b.id} style={{ gap: 4 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <Text
              onPress={() => router.push({ pathname: "/bill/[id]", params: { id: b.id } })}
              style={{ color: c.primary, fontWeight: "700" }}
            >
              {dmy(b.rent_period_start)}
            </Text>
            <Pill
              text={b.status === "paid" ? "Paid" : b.status === "partial" ? "Partial" : "Pending"}
              tone={b.status === "paid" ? "ok" : "warn"}
            />
          </View>
          <Row k="Total / Mila" v={`${inr(b.total_amount)} / ${inr(b.amount_paid ?? 0)}`} />
        </Card>
      ))}
    </ScrollView>
  );
}
