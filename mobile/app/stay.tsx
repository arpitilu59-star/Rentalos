import React, { useState } from "react";
import { Linking, Platform, Pressable, ScrollView, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Text, TextInput } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, inr, R } from "@/theme";

type Stay = {
  tenant_id: string; name: string; move_in_date: string; rent_share: number | null; persons: number; room: string; rent: number; property: string; address: string; city: string;
  landlord: { name: string; mobile: string | null };
  deposit: { held: number; deducted: number; refunded: number; status: string; reason: string | null } | null;
  usage: Array<{ date: string; units: number }>;
  notice: { at: string; moveOut: string | null } | null;
};
const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const wa = (m: string) => { const x = m.replace(/\D/g, ""); return `https://wa.me/${x.length === 10 ? "91" + x : x}`; };

export default function StayScreen() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["stay"], queryFn: () => api<{ stays: Stay[] }>("stay") });
  const [notice, setNotice] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const [reason, setReason] = useState("");
  const send = useMutation({
    mutationFn: (tenant_id: string) => api("stay/notice", { tenant_id, move_out_date: date, reason }),
    onSuccess: () => { setNotice(null); setDate(""); setReason(""); qc.invalidateQueries({ queryKey: ["stay"] }); },
  });
  const input = { backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;
  const row = (k: string, v: string) => <View style={{ flexDirection: "row", paddingVertical: 4 }}><Text style={{ color: c.muted, width: 110 }}>{k}</Text><Text style={{ color: c.text, flex: 1, fontWeight: "600" }}>{v}</Text></View>;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <ErrorText error={q.error} />
      {q.data && !q.data.stays.length && <Empty text="Abhi aap kisi room me tenant nahi hain. Booking accept hone par yahan sab dikhega." />}
      {q.data?.stays.map((s) => {
        const max = Math.max(1, ...s.usage.map((u) => u.units));
        return (
          <View key={s.tenant_id} style={{ gap: 12 }}>
            <Card>
              <Text style={{ color: c.text, fontWeight: "800", fontSize: 18 }}>{s.property} · Room {s.room}</Text>
              <Text style={{ color: c.muted, marginBottom: 8 }}>{[s.address, s.city].filter(Boolean).join(", ")}</Text>
              {row("Rent", inr(s.rent))}
              {s.rent_share != null && row("Mera hissa", inr(s.rent_share))}
              {row("Move-in", d(s.move_in_date))}
              {row("Log", String(s.persons))}
            </Card>
            <Card style={{ gap: 8 }}>
              <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>OWNER</Text>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{s.landlord.name}</Text>
              {s.landlord.mobile ? (
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button kind="ghost" title="📞 Call" style={{ flex: 1 }} onPress={() => Linking.openURL(`tel:${s.landlord.mobile}`)} />
                  <Button kind="ghost" title="💬 WhatsApp" style={{ flex: 1 }} onPress={() => Linking.openURL(wa(s.landlord.mobile!))} />
                </View>
              ) : <Text style={{ color: c.muted }}>Owner ka number add nahi hai.</Text>}
            </Card>
            {s.deposit && (
              <Card style={{ gap: 2 }}>
                <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>SECURITY DEPOSIT</Text>
                <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{inr(s.deposit.held)}</Text>
                <Text style={{ color: c.muted, textTransform: "capitalize" }}>Status: {s.deposit.status.replace("_", " ")}</Text>
                {s.deposit.deducted > 0 && <Text style={{ color: c.warn }}>Kata gaya {inr(s.deposit.deducted)}{s.deposit.reason ? ` — ${s.deposit.reason}` : ""}</Text>}
                {s.deposit.refunded > 0 && <Text style={{ color: c.primary }}>Wapas mila {inr(s.deposit.refunded)}</Text>}
              </Card>
            )}
            {s.usage.length > 0 && (
              <Card style={{ gap: 8 }}>
                <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>BIJLI USAGE (units)</Text>
                <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 8, height: 110 }}>
                  {s.usage.map((u) => (
                    <View key={u.date} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end" }}>
                      <Text style={{ color: c.text, fontSize: 11, fontWeight: "700" }}>{Math.round(u.units)}</Text>
                      <View style={{ width: "100%", height: Math.max(4, (u.units / max) * 80), backgroundColor: c.primary, borderRadius: 6, marginTop: 2 }} />
                      <Text style={{ color: c.muted, fontSize: 9, marginTop: 2 }}>{new Date(u.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>
                    </View>
                  ))}
                </View>
              </Card>
            )}
            <Card style={{ gap: 8 }}>
              <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>ROOM CHHODNA HAI?</Text>
              {s.notice ? (
                <Text style={{ color: c.warn, fontWeight: "700" }}>Notice bheja gaya ({d(s.notice.at)}){s.notice.moveOut ? ` — move-out ${d(s.notice.moveOut)}` : ""}. Owner aapse baat karega.</Text>
              ) : notice === s.tenant_id ? (<>
                <Pressable onPress={() => setShowPicker(true)} style={[input, { justifyContent: "center" }]}>
                  <Text style={{ color: date ? c.text : c.muted }}>{date ? d(date) : "Move-out date chunein"}</Text>
                </Pressable>
                {showPicker ? <DateTimePicker value={date ? new Date(date) : new Date(Date.now() + 30 * 864e5)} mode="date" minimumDate={new Date()}
                  onChange={(e, v) => { setShowPicker(Platform.OS === "ios"); if (e.type !== "dismissed" && v) setDate(iso(v)); }} /> : null}
                <TextInput value={reason} onChangeText={setReason} placeholder="Wajah (optional)" placeholderTextColor={c.muted} style={input} />
                <ErrorText error={send.error} />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Button kind="ghost" title="Cancel" onPress={() => setNotice(null)} />
                  <Button title="Notice bhejein" style={{ flex: 1 }} busy={send.isPending} disabled={date.length !== 10} onPress={() => send.mutate(s.tenant_id)} />
                </View>
              </>) : <Button kind="ghost" title="Move-out notice dein" onPress={() => setNotice(s.tenant_id)} />}
              <Text style={{ color: c.muted, fontSize: 12 }}>Notice period aur deposit refund aapke accept kiye hue terms ke hisaab se hote hain (Documents me dekhein).</Text>
            </Card>
          </View>
        );
      })}
    </ScrollView>
  );
}
