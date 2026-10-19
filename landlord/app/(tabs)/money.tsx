import React, { useState } from "react";
import { Alert, Image, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Field, Pill, Row, Segmented } from "@/lib/ui2";
import { useColors, inr, dmy } from "@/theme";

type Tab = "bills" | "verify" | "meters";
export default function Money() {
  const [tab, setTab] = useState<Tab>("bills");
  return (<View style={{ flex: 1 }}>
    <Segmented value={tab} onChange={setTab} options={[["bills", "Bills"], ["verify", "Payment verify"], ["meters", "Meter"]]} />
    {tab === "bills" ? <Bills /> : tab === "verify" ? <Verify /> : <Meters />}
  </View>);
}

type Bill = { id: string; status: string; total_amount: number; amount_paid: number; due_date: string | null; rent_period_start: string | null; tenants: { name: string } | null; rooms: { room_number: string } | null };
function Bills() {
  const c = useColors();
  const qc = useQueryClient();
  const [due, setDue] = useState(true);
  const q = useQuery({ queryKey: ["bills", due], queryFn: () => api<{ bills: Bill[] }>("l/bills", { filter: due ? "due" : "all" }) });
  const paid = useMutation({
    mutationFn: (p: { bill_id: string; method: string }) => api("l/bill/paid", p),
    onSuccess: () => { for (const k of ["bills", "home", "tenants"]) qc.invalidateQueries({ queryKey: [k] }); },
  });
  const ask = (b: Bill) => Alert.alert(`${inr(Number(b.total_amount) - Number(b.amount_paid))} mil gaye?`, "Bill 'paid' mark ho jayega.", [
    { text: "Nahi" }, { text: "Cash mila", onPress: () => paid.mutate({ bill_id: b.id, method: "cash" }) }, { text: "UPI/Bank mila", onPress: () => paid.mutate({ bill_id: b.id, method: "upi" }) },
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button kind={due ? "primary" : "ghost"} title="Baaki" onPress={() => setDue(true)} style={{ flex: 1, paddingVertical: 9 }} />
        <Button kind={!due ? "primary" : "ghost"} title="Sab bills" onPress={() => setDue(false)} style={{ flex: 1, paddingVertical: 9 }} />
      </View>
      <Text style={{ color: c.muted, fontSize: 12 }}>Naya bill banane ke liye Tenants tab mein tenant par "Bill banayein" dabayein.</Text>
      <ErrorText error={q.error ?? paid.error} />
      {q.isLoading ? <SkeletonList n={3} height={100} /> : null}
      {q.data && !q.data.bills.length ? <Empty text={due ? "Koi bill baaki nahi 🎉" : "Abhi koi bill nahi."} /> : null}
      {q.data?.bills.map((b) => {
        const left = Number(b.total_amount) - Number(b.amount_paid ?? 0);
        const late = b.status !== "paid" && b.due_date && b.due_date < today;
        return (
          <Card key={b.id} style={{ gap: 5 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{b.tenants?.name ?? "Tenant"} · Room {b.rooms?.room_number ?? "—"}</Text>
              <Pill text={b.status === "paid" ? "Paid" : late ? "Overdue" : b.status === "partial" ? "Partial" : "Pending"} tone={b.status === "paid" ? "ok" : late ? "danger" : "warn"} />
            </View>
            <Row k="Total" v={inr(b.total_amount)} />
            {b.status !== "paid" ? <Row k="Baaki" v={inr(left)} /> : null}
            <Row k="Due date" v={dmy(b.due_date)} />
            {b.status !== "paid" ? <Button title="Paid mark karein" onPress={() => ask(b)} style={{ paddingVertical: 9, marginTop: 4 }} /> : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

type Pay = { id: string; amount: number; upi_ref: string | null; screenshot: string | null; created_at: string; bill: { total_amount: number; amount_paid: number; tenants: { name: string } | null; rooms: { room_number: string } | null } | null };
function Verify() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["payments"], queryFn: () => api<{ payments: Pay[]; allowed: boolean }>("l/payments") });
  const decide = useMutation({
    mutationFn: (p: { payment_id: string; decision: "verify" | "reject" }) => api("l/payment/decide", p),
    onSuccess: () => { for (const k of ["payments", "bills", "home", "tenants"]) qc.invalidateQueries({ queryKey: [k] }); },
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <ErrorText error={q.error ?? decide.error} />
      {q.data && !q.data.allowed ? <Card style={{ borderColor: c.warn }}><Text style={{ color: c.text }}>Payment verification aapke plan mein chalu nahi hai. Plan upgrade karein ya bill ko "Paid mark" karein.</Text></Card> : null}
      {q.isLoading ? <SkeletonList n={2} height={160} /> : null}
      {q.data && !q.data.payments.length ? <Empty text="Verify karne ke liye koi payment nahi." /> : null}
      {q.data?.payments.map((p) => (
        <Card key={p.id} style={{ gap: 6 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 16 }}>{inr(p.amount)} · {p.bill?.tenants?.name ?? "Tenant"}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>Room {p.bill?.rooms?.room_number ?? "—"} · {dmy(p.created_at)}{p.upi_ref ? ` · UPI ref ${p.upi_ref}` : ""}</Text>
          {p.screenshot ? <Image source={{ uri: p.screenshot }} resizeMode="contain" style={{ width: "100%", height: 260, borderRadius: 12, backgroundColor: c.border }} /> : <Text style={{ color: c.muted, fontSize: 12 }}>Screenshot nahi diya.</Text>}
          <Text style={{ color: c.muted, fontSize: 12 }}>Apne bank/UPI app mein paisa aaya hai ye dekhkar hi verify karein.</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button kind="danger" title="Reject" onPress={() => decide.mutate({ payment_id: p.id, decision: "reject" })} style={{ flex: 1, paddingVertical: 10 }} />
            <Button title="Verify ✓" onPress={() => decide.mutate({ payment_id: p.id, decision: "verify" })} style={{ flex: 1, paddingVertical: 10 }} />
          </View>
        </Card>
      ))}
    </ScrollView>
  );
}

type M = { id: string; reading: number; note: string | null; createdAt: string; tenant: string; room: string; last: number | null; photo: string | null };
function Meters() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["meters"], queryFn: () => api<{ submissions: M[] }>("l/meters") });
  const [edit, setEdit] = useState<Record<string, string>>({});
  const decide = useMutation({
    mutationFn: (p: { id: string; approve: boolean; reading?: number }) => api("l/meter/decide", p),
    onSuccess: () => { for (const k of ["meters", "home"]) qc.invalidateQueries({ queryKey: [k] }); },
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <Card><Text style={{ color: c.muted, fontSize: 13 }}>Tenant ki bheji reading aapke approve karne ke baad hi bill mein judti hai. Photo se milakar zarurat ho to reading badal sakte hain.</Text></Card>
      <ErrorText error={q.error ?? decide.error} />
      {q.isLoading ? <SkeletonList n={2} height={200} /> : null}
      {q.data && !q.data.submissions.length ? <Empty text="Approve karne ke liye koi reading nahi." /> : null}
      {q.data?.submissions.map((m) => {
        const v = edit[m.id] ?? String(m.reading);
        const changed = Number(v) !== m.reading;
        return (
          <Card key={m.id} style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>{m.tenant} · Room {m.room}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{dmy(m.createdAt)} · pichli reading: {m.last ?? "—"}</Text>
            {m.photo ? <Image source={{ uri: m.photo }} resizeMode="contain" style={{ width: "100%", height: 220, borderRadius: 12, backgroundColor: c.border }} /> : null}
            {m.note ? <Text style={{ color: c.text }}>{m.note}</Text> : null}
            <Field label="Reading (zarurat ho to sahi karein)" value={v} onChange={(x) => setEdit((e) => ({ ...e, [m.id]: x }))} keyboard="numeric" />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button kind="danger" title="Reject" onPress={() => decide.mutate({ id: m.id, approve: false })} style={{ flex: 1, paddingVertical: 10 }} />
              <Button title={changed ? "Badal ke approve" : "Approve ✓"} onPress={() => decide.mutate({ id: m.id, approve: true, ...(changed ? { reading: Number(v) } : {}) })} style={{ flex: 1, paddingVertical: 10 }} />
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
