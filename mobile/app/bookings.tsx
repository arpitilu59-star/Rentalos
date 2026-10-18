import React from "react";
import { Alert, FlatList, View } from "react-native";
import { useT } from "@/lib/i18n";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, inr } from "@/theme";

type B = { id: string; status: string; created_at: string; rooms: { room_number: string; rent_amount: number; properties: { name: string; myr_city: string | null; city: string | null } | null } | null };

export default function Bookings() {
  const c = useColors();
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bookings"], queryFn: () => api<{ bookings: B[] }>("booking/list") });
  const cancel = useMutation({ mutationFn: (id: string) => api("booking/cancel", { booking_id: id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["home"] }); } });
  const col = (s: string) => (s === "accepted" ? c.primary : s === "pending" ? c.warn : c.danger);
  return (
    <FlatList
      data={q.data?.bookings ?? []} keyExtractor={(b) => b.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshing={q.isRefetching} onRefresh={() => q.refetch()}
      ListHeaderComponent={<ErrorText error={q.error ?? cancel.error} />}
      ListEmptyComponent={<Empty text={q.isLoading ? "Loading…" : "Abhi koi booking request nahi hai. Explore se room chuniye."} />}
      renderItem={({ item: b }) => (
        <Card>
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{b.rooms?.properties?.name} · Room {b.rooms?.room_number}</Text>
          <Text style={{ color: c.muted, marginTop: 2 }}>{inr(b.rooms?.rent_amount)}/mo · {b.rooms?.properties?.myr_city || b.rooms?.properties?.city} · {new Date(b.created_at).toLocaleDateString("en-IN")}</Text>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
            <Text style={{ color: col(b.status), fontWeight: "800", textTransform: "capitalize" }}>{b.status}</Text>
            {b.status === "pending" && <Button kind="ghost" title="Cancel" onPress={() => Alert.alert(t("Request cancel karein?"), "", [{ text: t("Nahi"), style: "cancel" }, { text: t("Haan, cancel"), style: "destructive", onPress: () => cancel.mutate(b.id) }])} />}
          </View>
        </Card>
      )}
    />
  );
}
