import React from "react";
import { Alert, Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Pill, Row } from "@/lib/ui2";
import { useColors, inr, dmy } from "@/theme";

type T = { id: string; name: string; phone: string | null; active: boolean; move_in_date: string | null; rent_share: number | null; due: number; tenant_code: string | null;
  rooms: { room_number: string; properties: { name: string } | null } | null };

export default function Tenants() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tenants"], queryFn: () => api<{ tenants: T[] }>("l/tenants") });
  const out = useMutation({
    mutationFn: (id: string) => api("l/tenant/moveout", { id }),
    onSuccess: () => { for (const k of ["tenants", "props", "home"]) qc.invalidateQueries({ queryKey: [k] }); },
  });
  const confirmOut = (t: T) => Alert.alert(`${t.name} ka move-out karein?`, "Tenant inactive ho jayega aur room mein jagah khali ho jayegi. Baaki bill pehle clear kar lein.", [{ text: "Nahi" }, { text: "Move-out", style: "destructive", onPress: () => out.mutate(t.id) }]);
  const rows = q.data?.tenants ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <Button title="+ Tenant add karein" onPress={() => router.push("/tenant-form" as never)} />
      <ErrorText error={q.error ?? out.error} />
      {q.isLoading ? <SkeletonList n={3} height={120} /> : null}
      {q.data && !rows.length ? <Empty text="Abhi koi tenant nahi hai. Booking request accept karein ya upar se add karein." /> : null}
      {rows.map((t) => (
        <Card key={t.id} style={{ gap: 6, opacity: t.active ? 1 : 0.6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{t.name}</Text>
            <Pill text={t.active ? "Active" : "Move-out ho gaya"} tone={t.active ? "ok" : "muted"} />
          </View>
          <Row k="Room" v={`${t.rooms?.properties?.name ?? ""} · ${t.rooms?.room_number ?? ""}`} />
          <Row k="Rent" v={inr(t.rent_share)} />
          <Row k="Move-in" v={dmy(t.move_in_date)} />
          {t.due > 0 ? <Row k="Baaki" v={<Text style={{ color: c.danger, fontWeight: "800" }}>{inr(t.due)}</Text>} /> : null}
          {t.tenant_code ? <Row k="Tenant code" v={t.tenant_code} /> : null}
          {t.active ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <Button kind="ghost" title="Call" onPress={() => t.phone && Linking.openURL(`tel:${t.phone}`)} style={{ paddingVertical: 9 }} />
              <Button kind="ghost" title="Edit" onPress={() => router.push({ pathname: "/tenant-form", params: { id: t.id } } as never)} style={{ paddingVertical: 9 }} />
              <Button title="Bill banayein" onPress={() => router.push({ pathname: "/bill-new", params: { tenant_id: t.id } } as never)} style={{ paddingVertical: 9 }} />
              <Button kind="danger" title="Move-out" onPress={() => confirmOut(t)} style={{ paddingVertical: 9 }} />
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}
