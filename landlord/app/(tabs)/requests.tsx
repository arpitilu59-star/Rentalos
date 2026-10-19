import React, { useState } from "react";
import { Alert, Image, Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Pill, Row, Segmented } from "@/lib/ui2";
import { useColors, inr, dmy } from "@/theme";

type Req = {
  id: string; status: string; created_at: string; tenant_name: string; tenant_mobile: string; message: string | null; verified: boolean;
  rooms: { room_number: string; rent_amount: number } | null; properties: { name: string } | null;
  terms: { accepted: number | null; current: number | null; needs: boolean } | null;
};
type Tk = { id: string; title: string; description: string | null; status: string; priority: string; created_at: string; photos: string[]; resolution_notes: string | null; tenants: { name: string } | null; rooms: { room_number: string } | null };

export default function Requests() {
  const [tab, setTab] = useState<"book" | "tickets">("book");
  return (<View style={{ flex: 1 }}>
    <Segmented value={tab} onChange={setTab} options={[["book", "Booking requests"], ["tickets", "Complaints"]]} />
    {tab === "book" ? <Bookings /> : <Tickets />}
  </View>);
}

function Bookings() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["requests"], queryFn: () => api<{ requests: Req[] }>("l/requests") });
  const decide = useMutation({
    mutationFn: (p: { id: string; decision: "accept" | "reject" }) => api("l/request/decide", { booking_id: p.id, decision: p.decision }),
    onSuccess: () => { for (const k of ["requests", "home", "tenants", "props"]) qc.invalidateQueries({ queryKey: [k] }); },
  });
  const ask = (r: Req, decision: "accept" | "reject") =>
    Alert.alert(decision === "accept" ? `${r.tenant_name} ko accept karein?` : "Request reject karein?",
      decision === "accept" ? "Tenant ban jayega aur room ka slot bhar jayega." : "Tenant ko request reject hone ki soochna milegi.",
      [{ text: "Nahi" }, { text: decision === "accept" ? "Accept" : "Reject", style: decision === "reject" ? "destructive" : "default", onPress: () => decide.mutate({ id: r.id, decision }) }]);
  const rows = q.data?.requests ?? [];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <ErrorText error={q.error ?? decide.error} />
      {q.isLoading ? <SkeletonList n={3} height={120} /> : null}
      {q.data && !rows.length ? <Empty text="Abhi koi booking request nahi aayi." /> : null}
      {rows.map((r) => (
        <Card key={r.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", flex: 1 }}>{r.tenant_name}</Text>
            <Pill text={r.status === "pending" ? "Pending" : r.status === "accepted" ? "Accepted" : "Rejected"} tone={r.status === "pending" ? "warn" : r.status === "accepted" ? "ok" : "muted"} />
          </View>
          <Row k="Room" v={`${r.properties?.name ?? ""} · ${r.rooms?.room_number ?? ""} (${inr(r.rooms?.rent_amount)})`} />
          <Row k="Mobile" v={r.tenant_mobile} />
          <Row k="Request" v={dmy(r.created_at)} />
          {r.message ? <Row k="Message" v={r.message} /> : null}
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            {r.verified ? <Pill text="ID verified tenant ✓" tone="ok" /> : <Pill text="ID verify nahi hua" tone="muted" />}
            {r.terms?.accepted != null ? <Pill text={r.terms.needs ? `Terms v${r.terms.accepted} (naya v${r.terms.current} baaki)` : `Terms v${r.terms.accepted} accept kiye`} tone={r.terms.needs ? "warn" : "ok"} /> : null}
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Button kind="ghost" title="Call" onPress={() => Linking.openURL(`tel:${r.tenant_mobile}`)} style={{ flex: 1, paddingVertical: 10 }} />
            {r.status === "pending" ? (<>
              <Button kind="danger" title="Reject" onPress={() => ask(r, "reject")} style={{ flex: 1, paddingVertical: 10 }} />
              <Button title="Accept" onPress={() => ask(r, "accept")} style={{ flex: 1, paddingVertical: 10 }} />
            </>) : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

function Tickets() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tickets"], queryFn: () => api<{ tickets: Tk[] }>("l/tickets") });
  const set = useMutation({
    mutationFn: (p: { id: string; status: string }) => api("l/ticket/status", p),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["tickets"] }); qc.invalidateQueries({ queryKey: ["home"] }); },
  });
  const rows = q.data?.tickets ?? [];
  const next: Record<string, Array<[string, string]>> = { open: [["in_progress", "Kaam shuru"], ["resolved", "Ho gaya"]], in_progress: [["resolved", "Ho gaya"]], resolved: [["open", "Dobara kholein"]], closed: [] };
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <ErrorText error={q.error ?? set.error} />
      {q.isLoading ? <SkeletonList n={3} height={110} /> : null}
      {q.data && !rows.length ? <Empty text="Koi complaint nahi hai." /> : null}
      {rows.map((t) => (
        <Card key={t.id} style={{ gap: 6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{t.title}</Text>
            <Pill text={t.status === "open" ? "Open" : t.status === "in_progress" ? "In progress" : "Resolved"} tone={t.status === "open" ? "danger" : t.status === "in_progress" ? "warn" : "ok"} />
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>{t.tenants?.name ?? "Tenant"} · Room {t.rooms?.room_number ?? "—"} · {t.priority} · {dmy(t.created_at)}</Text>
          {t.description ? <Text style={{ color: c.text }}>{t.description}</Text> : null}
          {t.photos.length ? <ScrollView horizontal>{t.photos.map((u) => <Image key={u} source={{ uri: u }} style={{ width: 90, height: 90, borderRadius: 10, marginRight: 8 }} />)}</ScrollView> : null}
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(next[t.status] ?? []).map(([s, l]) => <Button key={s} kind={s === "resolved" ? "primary" : "ghost"} title={l} onPress={() => set.mutate({ id: t.id, status: s })} style={{ flex: 1, paddingVertical: 10 }} />)}
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}
