import React, { useState } from "react";
import { Linking, Image, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { useColors, inr, R } from "@/theme";

type Info = { bill: { id: string; due: number; due_date: string }; payee: { name: string; upi: string | null }; termsRequired: boolean;
  payments: Array<{ id: string; amount: number; upi_ref: string | null; verification_status: string; created_at: string }> };

export default function Pay() {
  const { billId } = useLocalSearchParams<{ billId: string }>();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["pay", billId], queryFn: () => api<Info>("pay/info", { bill_id: billId }) });
  const [amount, setAmount] = useState("");
  const [ref, setRef] = useState("");
  const [shot, setShot] = useState<{ uri: string; b64: string } | null>(null);
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const d = q.data;
  const amt = Number(amount || d?.bill.due || 0);

  const pick = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setErr("Gallery ki permission chahiye."); return; }
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.5, base64: true });
    if (!r.canceled && r.assets[0]?.base64) { setShot({ uri: r.assets[0].uri, b64: r.assets[0].base64 }); setErr(null); }
  };
  const payUpi = async () => {
    if (!d?.payee.upi) return;
    const url = `upi://pay?pa=${encodeURIComponent(d.payee.upi)}&pn=${encodeURIComponent(d.payee.name)}&am=${amt.toFixed(2)}&cu=INR&tn=${encodeURIComponent("Rent via Rentalos")}`;
    try { await Linking.openURL(url); } catch { setErr("UPI app nahi mila. UPI ID copy karke apne UPI app me paste karein."); }
  };
  const submit = useMutation({
    mutationFn: () => api("pay/submit", { bill_id: billId, amount: amt, upi_ref: ref, note, screenshot_base64: shot?.b64, screenshot_mime: "image/jpeg" }),
    onSuccess: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); qc.invalidateQueries({ queryKey: ["pay", billId] }); qc.invalidateQueries({ queryKey: ["bills"] }); qc.invalidateQueries({ queryKey: ["home"] }); setRef(""); setShot(null); setNote(""); },
  });
  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;
  const pending = d?.payments.some((p) => p.verification_status === "submitted");

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <ErrorText error={q.error} />
      {d && (<>
        <Card style={{ backgroundColor: c.soft }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>AMOUNT DUE</Text>
          <Text style={{ color: c.text, fontSize: 34, fontWeight: "800" }}>{inr(d.bill.due)}</Text>
          <Text style={{ color: c.muted }}>To: {d.payee.name}</Text>
        </Card>
        {d.termsRequired && <Card><Text style={{ color: c.danger, fontWeight: "700" }}>Pehle rental terms accept karein</Text><Text style={{ color: c.muted, marginTop: 4 }}>Payment se pehle booking ke terms accept karna zaroori hai.</Text><Button style={{ marginTop: 10 }} title="Terms dekhein" onPress={() => router.push("/bookings")} /></Card>}
        <Text style={{ color: c.text, fontWeight: "800" }}>Step 1 — UPI se pay karein</Text>
        {d.payee.upi ? (
          <Card style={{ gap: 10 }}>
            <Text selectable style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{d.payee.upi}</Text>
            <TextInput value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder={`Amount (${d.bill.due})`} placeholderTextColor={c.muted} style={input} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Button title="Open UPI app" style={{ flex: 1 }} onPress={payUpi} />
              <Button kind="ghost" title="Copy ID" onPress={() => Clipboard.setStringAsync(d.payee.upi!)} />
            </View>
          </Card>
        ) : <Card><Text style={{ color: c.muted }}>Owner ne UPI ID add nahi ki. Owner se seedha pay karke neeche proof daal dein.</Text></Card>}
        <Text style={{ color: c.text, fontWeight: "800" }}>Step 2 — Proof bhejein</Text>
        <TextInput value={ref} onChangeText={setRef} placeholder="UPI reference / UTR number" placeholderTextColor={c.muted} style={input} />
        <Button kind="ghost" title={shot ? "Screenshot badlein" : "Payment screenshot chunein"} onPress={pick} />
        {shot && <Image source={{ uri: shot.uri }} style={{ height: 180, borderRadius: R.m, backgroundColor: c.soft }} resizeMode="contain" />}
        <TextInput value={note} onChangeText={setNote} placeholder="Note (optional)" placeholderTextColor={c.muted} style={input} />
        <ErrorText error={err ?? submit.error} />
        <Button title="Proof submit karein" busy={submit.isPending} disabled={d.termsRequired || (!ref.trim() && !shot) || !(amt > 0)} onPress={() => { setErr(null); submit.mutate(); }} />
        {pending && <Text style={{ color: c.warn, textAlign: "center" }}>Aapka payment owner ke verify karne ka wait kar raha hai.</Text>}
        {d.payments.length > 0 && (<>
          <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12, marginTop: 6 }}>PAYMENT HISTORY</Text>
          {d.payments.map((p) => (
            <Card key={p.id}><View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "700" }}>{inr(p.amount)}</Text>
              <Text style={{ color: p.verification_status === "verified" ? c.primary : p.verification_status === "rejected" ? c.danger : c.warn, fontWeight: "700", textTransform: "capitalize" }}>{p.verification_status}</Text>
            </View><Text style={{ color: c.muted, marginTop: 2 }}>{new Date(p.created_at).toLocaleString("en-IN")}{p.upi_ref ? ` · ${p.upi_ref}` : ""}</Text></Card>
          ))}
        </>)}
      </>)}
    </ScrollView>
  );
}
