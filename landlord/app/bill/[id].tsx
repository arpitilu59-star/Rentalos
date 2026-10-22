import React, { useState } from "react";
import { Alert, Linking, ScrollView, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Field, Pill, Row } from "@/lib/ui2";
import { useRouter } from "expo-router";
import { useColors, inr, dmy } from "@/theme";

type Detail = {
  bill: {
    id: string;
    status: string;
    total_amount: number;
    amount_paid: number;
    due_date: string | null;
    rent_period_start: string | null;
    rent_period_end: string | null;
    rent_amount: number;
    electricity_amount: number;
    units_consumed: number;
    prev_reading: number;
    curr_reading: number;
    water_amount: number;
    cleaning_amount: number;
    other_charges: number;
    other_charges_note: string | null;
    previous_dues: number;
    tenants: { name: string; phone: string } | null;
    rooms: { room_number: string } | null;
  };
  payments: Array<{
    id: string;
    amount: number;
    method: string | null;
    paid_on: string | null;
    created_at: string;
    verification_status: string | null;
  }>;
  whatsapp_ready: boolean;
  has_upi: boolean;
};

export default function BillDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["bill", id],
    queryFn: () => api<Detail>("l/bill", { bill_id: id }),
  });
  const router = useRouter();
  const [note, setNote] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const [pauseTo, setPauseTo] = useState("");

  const openLink = async (url: string, what: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(what, "Link khul nahi paya. Phone mein WhatsApp / browser check karein.");
    }
  };

  // PDF: server builds it → opens in the phone's PDF viewer/browser where Download / Share is available.
  const pdf = useMutation({
    mutationFn: () => api<{ pdf_url: string }>("l/bill/pdf", { bill_id: id }),
    onSuccess: (r) => openLink(r.pdf_url, "PDF"),
  });
  // WhatsApp: opens the landlord's own WhatsApp with the bill text typed in; they press send.
  const wa = useMutation({
    mutationFn: (withPdf: boolean) =>
      api<{ whatsapp_url: string | null }>(withPdf ? "l/bill/pdf" : "l/bill/whatsapp", {
        bill_id: id,
      }),
    onSuccess: (r) => {
      if (!r.whatsapp_url) return Alert.alert("WhatsApp", "Tenant ka phone number sahi nahi hai.");
      openLink(r.whatsapp_url, "WhatsApp");
      setNote("WhatsApp khul gaya — message aap khud send karenge.");
    },
  });
  const paid = useMutation({
    mutationFn: (p: { method: string; amount?: number }) =>
      api("l/bill/paid", { bill_id: id, ...p }),
    onSuccess: () => {
      setAmt("");
      for (const k of ["bills", "home", "tenants", "bill"]) qc.invalidateQueries({ queryKey: [k] });
    },
  });

  const pause = useMutation({
    mutationFn: (until: string) => api("l/bill/pause", { bill_id: id, until }),
    onSuccess: () => setNote("Reminders ruk gaye ✓"),
  });
  const del = useMutation({
    mutationFn: () => api("l/bill/delete", { bill_id: id }),
    onSuccess: () => {
      for (const k of ["bills", "home", "tenants"]) qc.invalidateQueries({ queryKey: [k] });
      router.back();
    },
  });

  if (q.isLoading) return <SkeletonList n={3} height={120} />;
  const d = q.data;
  if (!d)
    return (
      <View style={{ padding: 16 }}>
        <ErrorText error={q.error} />
      </View>
    );
  const b = d.bill;
  const left = Number(b.total_amount) - Number(b.amount_paid ?? 0);
  const today = new Date().toISOString().slice(0, 10);
  const late = b.status !== "paid" && !!b.due_date && b.due_date < today;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Card style={{ gap: 6 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 17, flex: 1 }}>
            {b.tenants?.name ?? "Tenant"} · Room {b.rooms?.room_number ?? "—"}
          </Text>
          <Pill
            text={
              b.status === "paid"
                ? "Paid"
                : late
                  ? "Overdue"
                  : b.status === "partial"
                    ? "Partial"
                    : "Pending"
            }
            tone={b.status === "paid" ? "ok" : late ? "danger" : "warn"}
          />
        </View>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          {dmy(b.rent_period_start)} – {dmy(b.rent_period_end)} · Due {dmy(b.due_date)}
        </Text>
      </Card>

      <Card style={{ gap: 4 }}>
        <Row k="Rent" v={inr(b.rent_amount)} />
        <Row
          k={`Bijli (${b.units_consumed} units)`}
          v={`${inr(b.electricity_amount)}  ·  ${b.prev_reading}→${b.curr_reading}`}
        />
        <Row k="Water" v={inr(b.water_amount)} />
        <Row k="Cleaning" v={inr(b.cleaning_amount)} />
        {Number(b.other_charges) > 0 ? (
          <Row k={b.other_charges_note || "Other"} v={inr(b.other_charges)} />
        ) : null}
        {Number(b.previous_dues) > 0 ? <Row k="Pichla baaki" v={inr(b.previous_dues)} /> : null}
        <Row k="Total" v={inr(b.total_amount)} />
        <Row k="Mila" v={inr(b.amount_paid ?? 0)} />
        {b.status !== "paid" ? <Row k="Baaki" v={inr(left)} /> : null}
      </Card>

      <ErrorText error={pdf.error ?? wa.error ?? paid.error ?? pause.error ?? del.error} />
      <Button title="PDF download / share" busy={pdf.isPending} onPress={() => pdf.mutate()} />
      <Button
        kind="ghost"
        title="WhatsApp par bhejein (text)"
        busy={wa.isPending && wa.variables === false}
        disabled={!d.whatsapp_ready}
        onPress={() => wa.mutate(false)}
      />
      <Button
        kind="ghost"
        title="WhatsApp par bhejein (PDF link ke saath)"
        busy={wa.isPending && wa.variables === true}
        disabled={!d.whatsapp_ready}
        onPress={() => wa.mutate(true)}
      />
      {!d.whatsapp_ready ? (
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Tenant ka phone number sahi nahi hai, isliye WhatsApp band hai. Tenant edit karke number
          theek karein.
        </Text>
      ) : (
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Ye aapke apne WhatsApp mein khulta hai — message tab hi jata hai jab aap send dabate hain.
          App ise "delivered" nahi dikhata.
        </Text>
      )}
      {note ? <Text style={{ color: c.muted, fontSize: 12 }}>{note}</Text> : null}

      {b.status !== "paid" ? (
        <Card style={{ gap: 8 }}>
          <Field
            label="Kitne mile? (partial payment)"
            value={amt}
            onChange={setAmt}
            keyboard="numeric"
            hint={`Baaki ${inr(left)} — khaali chhodein to poora`}
          />
          <Button
            kind="ghost"
            title="Ye amount record karein"
            disabled={!amt || Number(amt) <= 0 || Number(amt) > left}
            onPress={() =>
              Alert.alert(`${inr(Number(amt))} mile?`, "Payment record ho jayegi.", [
                { text: "Nahi" },
                {
                  text: "Cash",
                  onPress: () => paid.mutate({ method: "cash", amount: Number(amt) }),
                },
                {
                  text: "UPI/Bank",
                  onPress: () => paid.mutate({ method: "upi", amount: Number(amt) }),
                },
              ])
            }
          />
          <Field
            label="Reminders band karein (YYYY-MM-DD tak)"
            value={pauseTo}
            onChange={setPauseTo}
            placeholder="2026-11-30"
          />
          <Button
            kind="ghost"
            title="Reminders roken"
            disabled={!/^\d{4}-\d{2}-\d{2}$/.test(pauseTo)}
            busy={pause.isPending}
            onPress={() => pause.mutate(pauseTo)}
          />
        </Card>
      ) : null}
      {b.status !== "paid" ? (
        <Button
          title="Poora paid mark karein"
          onPress={() =>
            Alert.alert(`${inr(left)} mil gaye?`, "Bill 'paid' mark ho jayega.", [
              { text: "Nahi" },
              { text: "Cash mila", onPress: () => paid.mutate({ method: "cash" }) },
              { text: "UPI/Bank mila", onPress: () => paid.mutate({ method: "upi" }) },
            ])
          }
        />
      ) : null}

      {!d.payments.length && Number(b.amount_paid ?? 0) === 0 ? (
        <Button
          kind="danger"
          title="Bill delete karein"
          busy={del.isPending}
          onPress={() =>
            Alert.alert("Bill delete karein?", "Ye wapas nahi aayega.", [
              { text: "Nahi" },
              { text: "Delete", style: "destructive", onPress: () => del.mutate() },
            ])
          }
        />
      ) : null}

      {d.payments.length ? (
        <Card style={{ gap: 4 }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>Payments</Text>
          {d.payments.map((p) => (
            <Row
              key={p.id}
              k={`${dmy(p.paid_on ?? p.created_at)} · ${p.method ?? "—"}${
                p.verification_status && p.verification_status !== "verified"
                  ? ` (${p.verification_status})`
                  : ""
              }`}
              v={inr(p.amount)}
            />
          ))}
        </Card>
      ) : null}
    </ScrollView>
  );
}
