import React from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Row } from "@/lib/ui2";
import { useColors } from "@/theme";

type A = {
  room: { id: string; room_number: string };
  monthly: Array<{ month: string; label: string; reading: number; units: number; raw: number }>;
  anomalies: Array<{ type: string; month: string; detail: string }>;
  months_tracked: number;
  avg_units: number;
  last_units: number;
};

/** Monthly consumption + faulty-meter alerts for one room (same rules as the website). */
export default function MeterAnalysis() {
  const { room_id } = useLocalSearchParams<{ room_id: string }>();
  const c = useColors();
  const q = useQuery({
    queryKey: ["meter-analysis", room_id],
    queryFn: () => api<A>("l/meter/analysis", { room_id }),
  });
  const d = q.data;
  const rows = (d?.monthly ?? []).slice(1);
  const max = Math.max(1, ...rows.map((m) => m.units));
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <ErrorText error={q.error} />
      {q.isLoading ? <SkeletonList n={3} height={90} /> : null}
      {d ? (
        <>
          <Text style={{ color: c.text, fontSize: 18, fontWeight: "800" }}>
            Room {d.room.room_number} · Meter analysis
          </Text>
          {d.anomalies.length ? (
            <Card style={{ gap: 6, borderColor: c.danger }}>
              <Text style={{ color: c.danger, fontWeight: "800" }}>
                {d.anomalies.length} possible meter issue{d.anomalies.length > 1 ? "s" : ""}
              </Text>
              {d.anomalies.map((a, i) => (
                <Text key={i} style={{ color: c.text, fontSize: 13 }}>
                  <Text style={{ fontWeight: "700", color: c.danger }}>{a.month}: </Text>
                  {a.detail}
                </Text>
              ))}
            </Card>
          ) : d.monthly.length > 1 ? (
            <Card>
              <Text style={{ color: c.ok, fontWeight: "700" }}>
                ✓ Meter normal hai — koi gadbad nahi mili.
              </Text>
            </Card>
          ) : null}
          <Card style={{ gap: 4 }}>
            <Row k="Months tracked" v={String(d.months_tracked)} />
            <Row k="Average / month" v={`${d.avg_units} units`} />
            <Row k="Pichla mahina" v={`${d.last_units} units`} />
          </Card>
          <Card style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>Monthly units</Text>
            {rows.length < 1 ? (
              <Empty text="Kam se kam 2 mahine ki reading chahiye." />
            ) : (
              rows.map((m) => (
                <View key={m.month} style={{ gap: 3 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.muted, fontSize: 12 }}>{m.label}</Text>
                    <Text style={{ color: c.text, fontSize: 12, fontWeight: "700" }}>
                      {m.units} units
                    </Text>
                  </View>
                  <View style={{ height: 8, borderRadius: 4, backgroundColor: c.border }}>
                    <View
                      style={{
                        height: 8,
                        borderRadius: 4,
                        width: `${Math.max(2, (m.units / max) * 100)}%`,
                        backgroundColor: m.raw < 0 ? c.danger : c.primary,
                      }}
                    />
                  </View>
                </View>
              ))
            )}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
