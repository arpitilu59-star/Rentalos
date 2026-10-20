import React, { useState } from "react";
import { Alert, Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { FilterRow, Pill, Row, SearchBar, Segmented } from "@/lib/ui2";
import { useColors, inr, dmy } from "@/theme";

type T = {
  id: string;
  name: string;
  phone: string | null;
  active: boolean;
  move_in_date: string | null;
  rent_share: number | null;
  due: number;
  tenant_code: string | null;
  rooms: { room_number: string; properties: { name: string } | null } | null;
};

function TenantList() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["tenants"], queryFn: () => api<{ tenants: T[] }>("l/tenants") });
  const [term, setTerm] = useState("");
  const [f, setF] = useState<"active" | "dues" | "inactive" | "all">("active");
  const out = useMutation({
    mutationFn: (p: { id: string; force?: boolean }) =>
      api("l/tenant/moveout", { id: p.id, force_unpaid: p.force === true }),
    onSuccess: () => {
      for (const k of ["tenants", "props", "home"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });
  type Chk = {
    name: string;
    unpaidBills: number;
    due: number;
    depositHeld: number | null;
    pendingMeter: number;
    pendingPayments: number;
  };
  const confirmOut = async (t: T) => {
    try {
      const k = await api<Chk>("l/tenant/moveout-check", { id: t.id });
      const lines = [
        k.due > 0 ? `⚠ ${k.unpaidBills} bill baaki: ${inr(k.due)}` : "✓ Koi bill baaki nahi",
        k.pendingPayments > 0 ? `⚠ ${k.pendingPayments} payment proof verify hona baaki` : null,
        k.pendingMeter > 0
          ? `⚠ ${k.pendingMeter} meter reading approve hona baaki`
          : "✓ Meter reading clear",
        k.depositHeld != null
          ? `ℹ Deposit ${inr(k.depositHeld)} abhi held hai — Money → Deposit mein settle karein`
          : "ℹ Deposit record nahi mila",
      ]
        .filter(Boolean)
        .join("\n");
      Alert.alert(`${t.name} ka move-out karein?`, `${lines}\n\nRoom mein jagah khali ho jayegi.`, [
        { text: "Nahi" },
        {
          text: k.due > 0 ? "Baaki ke saath move-out" : "Move-out",
          style: "destructive",
          onPress: () => out.mutate({ id: t.id, force: k.due > 0 }),
        },
      ]);
    } catch (e) {
      Alert.alert("Check nahi ho paya", e instanceof Error ? e.message : "Dobara try karein.");
    }
  };
  const needle = term.trim().toLowerCase();
  const rows = (q.data?.tenants ?? []).filter(
    (t) =>
      (f === "all" ||
        (f === "active" && t.active) ||
        (f === "inactive" && !t.active) ||
        (f === "dues" && t.active && t.due > 0)) &&
      (!needle ||
        `${t.name} ${t.phone ?? ""} ${t.rooms?.room_number ?? ""} ${t.rooms?.properties?.name ?? ""}`
          .toLowerCase()
          .includes(needle)),
  );
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <Button title="+ Tenant add karein" onPress={() => router.push("/tenant-form" as never)} />
      <SearchBar value={term} onChange={setTerm} placeholder="Naam, phone, room ya property" />
      <FilterRow
        value={f}
        onChange={setF}
        options={[
          ["active", "Active"],
          ["dues", "Baaki dues"],
          ["inactive", "Move-out"],
          ["all", "Sab"],
        ]}
      />
      <ErrorText error={q.error ?? out.error} />
      {q.isLoading ? <SkeletonList n={3} height={120} /> : null}
      {q.data && !rows.length ? (
        <Empty
          text={
            q.data.tenants.length
              ? "Is filter mein koi tenant nahi."
              : "Abhi koi tenant nahi hai. Booking request accept karein ya upar se add karein."
          }
        />
      ) : null}
      {rows.map((t) => (
        <Card key={t.id} style={{ gap: 6, opacity: t.active ? 1 : 0.6 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", flex: 1 }}>
              {t.name}
            </Text>
            <Pill
              text={t.active ? "Active" : "Move-out ho gaya"}
              tone={t.active ? "ok" : "muted"}
            />
          </View>
          <Row k="Room" v={`${t.rooms?.properties?.name ?? ""} · ${t.rooms?.room_number ?? ""}`} />
          <Row k="Rent" v={inr(t.rent_share)} />
          <Row k="Move-in" v={dmy(t.move_in_date)} />
          {t.due > 0 ? (
            <Row
              k="Baaki"
              v={<Text style={{ color: c.danger, fontWeight: "800" }}>{inr(t.due)}</Text>}
            />
          ) : null}
          {t.tenant_code ? <Row k="Tenant code" v={t.tenant_code} /> : null}
          {t.active ? (
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
              <Button
                kind="ghost"
                title="Call"
                onPress={() => t.phone && Linking.openURL(`tel:${t.phone}`)}
                style={{ paddingVertical: 9 }}
              />
              <Button
                kind="ghost"
                title="Edit"
                onPress={() =>
                  router.push({ pathname: "/tenant-form", params: { id: t.id } } as never)
                }
                style={{ paddingVertical: 9 }}
              />
              <Button
                title="Bill banayein"
                onPress={() =>
                  router.push({ pathname: "/bill-new", params: { tenant_id: t.id } } as never)
                }
                style={{ paddingVertical: 9 }}
              />
              <Button
                kind="danger"
                title="Move-out"
                onPress={() => confirmOut(t)}
                style={{ paddingVertical: 9 }}
              />
            </View>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}

type Mv = {
  id: string;
  kind: string;
  move_date: string;
  meter_reading: number | null;
  condition_notes: string | null;
  checklist: Record<string, boolean> | null;
  tenants: { name: string } | null;
  rooms: { room_number: string } | null;
};
function Moves() {
  const c = useColors();
  const router = useRouter();
  const q = useQuery({ queryKey: ["moves"], queryFn: () => api<{ moves: Mv[] }>("l/moves") });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <Button
        title="+ Move-in / Move-out record"
        onPress={() => router.push("/move-form" as never)}
      />
      <ErrorText error={q.error} />
      {q.isLoading ? <SkeletonList n={2} height={100} /> : null}
      {q.data && !q.data.moves.length ? (
        <Empty text="Abhi koi move-in / move-out record nahi." />
      ) : null}
      {q.data?.moves.map((m) => {
        const done = Object.entries(m.checklist ?? {}).filter(([, v]) => v).length;
        return (
          <Card key={m.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "800" }}>
                {m.tenants?.name ?? "Tenant"} · Room {m.rooms?.room_number ?? "—"}
              </Text>
              <Pill
                text={m.kind === "move_in" ? "Move-in" : "Move-out"}
                tone={m.kind === "move_in" ? "ok" : "warn"}
              />
            </View>
            <Row k="Date" v={dmy(m.move_date)} />
            {m.meter_reading != null ? <Row k="Meter" v={String(m.meter_reading)} /> : null}
            {done ? <Row k="Checklist" v={`${done} cheezein tick`} /> : null}
            {m.condition_notes ? <Row k="Notes" v={m.condition_notes} /> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

export default function Tenants() {
  const [tab, setTab] = useState<"list" | "moves">("list");
  return (
    <View style={{ flex: 1 }}>
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          ["list", "Tenants"],
          ["moves", "Move records"],
        ]}
      />
      {tab === "list" ? <TenantList /> : <Moves />}
    </View>
  );
}
