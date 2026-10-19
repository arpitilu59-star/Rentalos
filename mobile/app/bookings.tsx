import React, { useState } from "react";
import { Alert, FlatList, Pressable, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { termsRows } from "@/lib/terms";
import { useT } from "@/lib/i18n";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, inr } from "@/theme";

type B = { needsReaccept: boolean; terms: any; version: number | null; id: string; status: string; created_at: string; rooms: { room_number: string; rent_amount: number; myr_deposit?: number | null; properties: { name: string; myr_city: string | null; city: string | null } | null } | null };

function Reaccept({ b, acks }: { b: B; acks: Array<{ key: string; label: string }> }) {
  const c = useColors();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const send = useMutation({
    mutationFn: () => api("booking/reaccept", { booking_id: b.id, acknowledgements: ticked }),
    onSuccess: () => { setOpen(false); qc.invalidateQueries({ queryKey: ["bookings"] }); qc.invalidateQueries({ queryKey: ["pay"] }); },
  });
  const all = acks.every((a) => ticked[a.key]);
  return (
    <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 10, gap: 8 }}>
      <Text style={{ color: c.warn, fontWeight: "800" }}>Terms badal gaye — dobara accept karein</Text>
      {!open ? <Button title="Naye terms dekhein" onPress={() => setOpen(true)} /> : (<>
        {termsRows(b.terms, b.rooms?.rent_amount ?? 0, b.rooms?.myr_deposit ?? null).map(([k, v]) => (
          <View key={k} style={{ flexDirection: "row", gap: 10 }}><Text style={{ color: c.muted, width: 120 }}>{k}</Text><Text style={{ color: c.text, flex: 1, fontWeight: "600" }}>{v}</Text></View>
        ))}
        {acks.map((a) => (
          <Pressable key={a.key} onPress={() => setTicked((x) => ({ ...x, [a.key]: !x[a.key] }))} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
            <Ionicons name={ticked[a.key] ? "checkbox" : "square-outline"} size={24} color={ticked[a.key] ? c.primary : c.muted} />
            <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>{a.label}</Text>
          </Pressable>
        ))}
        <ErrorText error={send.error} />
        <Button title="Naye terms accept karein" busy={send.isPending} disabled={!all} onPress={() => send.mutate()} />
        <Text style={{ color: c.muted, fontSize: 12 }}>Aapne pehle jo terms accept kiye the woh badalte nahi — ye naya version alag se record hota hai.</Text>
      </>)}
    </View>
  );
}

export default function Bookings() {
  const c = useColors();
  const t = useT();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["bookings"], queryFn: () => api<{ bookings: B[]; acks: Array<{ key: string; label: string }> }>("booking/list") });
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
          {b.needsReaccept && b.terms ? <Reaccept b={b} acks={q.data?.acks ?? []} /> : null}
        </Card>
      )}
    />
  );
}
