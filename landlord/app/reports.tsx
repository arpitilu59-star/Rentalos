import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useRouter } from "expo-router";
import { SkeletonList } from "@/components/Skeleton";
import { Pill, Row } from "@/lib/ui2";
import { useColors, inr } from "@/theme";

type Rep = {
  months: Array<{
    month: string;
    label: string;
    billed: number;
    collected: number;
    expenses: number;
  }>;
  total_collected: number;
  total_expenses: number;
  top_dues: Array<{ name: string; room: string; due: number; overdue: boolean }>;
  occupancy: Array<{ id: string; name: string; beds: number; used: number; pct: number }>;
};

/** Read-only business summary: last 6 months billed vs collected, biggest dues, occupancy. */
export default function Reports() {
  const c = useColors();
  const router = useRouter();
  const q = useQuery({ queryKey: ["reports"], queryFn: () => api<Rep>("l/reports") });
  const d = q.data;
  const max = Math.max(1, ...(d?.months ?? []).map((m) => Math.max(m.billed, m.collected)));
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <ErrorText error={q.error} />
      {q.isLoading ? <SkeletonList n={3} height={110} /> : null}
      {d ? (
        <>
          <Card style={{ gap: 4 }}>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              Pichle 6 mahine mein mila (verified)
            </Text>
            <Text style={{ color: c.text, fontSize: 26, fontWeight: "800" }}>
              {inr(d.total_collected)}
            </Text>
          </Card>
          <Card style={{ gap: 4 }}>
            <Row k="Kharcha (6 mahine)" v={inr(d.total_expenses)} />
            <Row k="Net (mila − kharcha)" v={inr(d.total_collected - d.total_expenses)} />
            <Button
              kind="ghost"
              title="Kharche dekhein / daalein"
              onPress={() => router.push("/expenses" as never)}
              style={{ paddingVertical: 9, marginTop: 4 }}
            />
          </Card>
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>Billed vs collected</Text>
            {d.months.map((m) => (
              <View key={m.month} style={{ gap: 3 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                  <Text style={{ color: c.muted, fontSize: 12 }}>{m.label}</Text>
                  <Text style={{ color: c.text, fontSize: 12 }}>
                    {inr(m.collected)} / {inr(m.billed)}
                  </Text>
                </View>
                <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}>
                  <View
                    style={{
                      position: "absolute",
                      height: 8,
                      borderRadius: 4,
                      width: `${(m.billed / max) * 100}%`,
                      backgroundColor: c.soft,
                    }}
                  />
                  <View
                    style={{
                      height: 8,
                      borderRadius: 4,
                      width: `${(m.collected / max) * 100}%`,
                      backgroundColor: c.primary,
                    }}
                  />
                </View>
              </View>
            ))}
          </Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Sabse zyada baaki</Text>
          {!d.top_dues.length ? <Empty text="Koi baaki nahi 🎉" /> : null}
          {d.top_dues.map((t, i) => (
            <Card key={i} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>
                  {t.name} · Room {t.room}
                </Text>
                <Pill text={t.overdue ? "Overdue" : "Baaki"} tone={t.overdue ? "danger" : "warn"} />
              </View>
              <Row k="Baaki rakam" v={inr(t.due)} />
            </Card>
          ))}
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Occupancy</Text>
          {!d.occupancy.length ? <Empty text="Koi property nahi." /> : null}
          {d.occupancy.map((o) => (
            <Card key={o.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>{o.name}</Text>
                <Text style={{ color: c.muted }}>
                  {o.used}/{o.beds} beds · {o.pct}%
                </Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}>
                <View
                  style={{ height: 8, borderRadius: 4, width: `${o.pct}%`, backgroundColor: c.ok }}
                />
              </View>
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
