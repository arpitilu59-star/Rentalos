import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Speech from "expo-speech";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { termsRows } from "@/lib/terms";
import { Button, Card, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

type TermsRes = { speech: string | null; terms: any; version: number | null; rent: number; deposit: number | null; acks: Array<{ key: string; label: string }> };

export default function Book() {
  const { roomId } = useLocalSearchParams<{ roomId: string }>();
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { session } = useAuth();
  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [msg, setMsg] = useState("");
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState(false);
  const q = useQuery({ queryKey: ["room-terms", roomId], queryFn: () => api<TermsRes>("room/terms", { room_id: roomId }) });
  useEffect(() => { setName((n) => n || (session?.user.user_metadata?.full_name as string) || ""); }, [session]);

  const submit = useMutation({
    mutationFn: () => api("booking/create", { room_id: roomId, tenant_name: name, tenant_mobile: mobile, tenant_email: session?.user.email, message: msg, acknowledgements: ticked, listened: heard }),
    onSuccess: () => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); qc.invalidateQueries({ queryKey: ["home"] }); qc.invalidateQueries({ queryKey: ["bookings"] }); setDone(true); },
  });
  const d = q.data;
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState(false);
  useEffect(() => () => { Speech.stop(); }, []);
  const listen = () => { if (speaking) { Speech.stop(); setSpeaking(false); return; } if (!d?.speech) return; setSpeaking(true); Speech.speak(d.speech, { language: "en-IN", onDone: () => { setSpeaking(false); setHeard(true); }, onStopped: () => setSpeaking(false), onError: () => setSpeaking(false) }); };
  const hasTerms = !!d?.terms && d.version != null;
  const allTicked = !hasTerms || d!.acks.every((a) => ticked[a.key]);
  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text } as const;

  if (done) return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 28, gap: 12 }}>
      <Ionicons name="checkmark-circle" size={72} color={c.primary} />
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>Request bhej di!</Text>
      <Text style={{ color: c.muted, textAlign: "center" }}>Owner ke jawab ka notification milega. Aapne jo terms accept kiye woh save ho gaye hain.</Text>
      <Button title="My requests dekhein" onPress={() => router.replace("/bookings")} />
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
        <ErrorText error={q.error} />
        {hasTerms ? (
          <Card>
            <Text style={{ color: c.text, fontWeight: "800", fontSize: 16, marginBottom: 6 }}>Rental terms (v{d!.version})</Text>
            {d!.speech ? <Button kind="ghost" title={speaking ? "⏹ Rokein" : "🔊 Sunein (read aloud)"} style={{ marginBottom: 6 }} onPress={listen} /> : null}
            {termsRows(d!.terms, d!.rent, d!.deposit).map(([k, val]) => (
              <View key={k} style={{ flexDirection: "row", paddingVertical: 5, gap: 10 }}>
                <Text style={{ color: c.muted, width: 120 }}>{k}</Text>
                <Text style={{ color: c.text, flex: 1, fontWeight: "600" }}>{val}</Text>
              </View>
            ))}
          </Card>
        ) : d ? <Text style={{ color: c.muted }}>Is owner ne abhi detailed terms publish nahi kiye. Rent aur deposit owner se confirm kar lein.</Text> : null}

        {hasTerms && (
          <Card style={{ gap: 10 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>Padh kar tick karein</Text>
            {d!.acks.map((a) => (
              <Pressable key={a.key} onPress={() => setTicked((t) => ({ ...t, [a.key]: !t[a.key] }))} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
                <Ionicons name={ticked[a.key] ? "checkbox" : "square-outline"} size={24} color={ticked[a.key] ? c.primary : c.muted} />
                <Text style={{ color: c.text, flex: 1, lineHeight: 20 }}>{a.label}</Text>
              </Pressable>
            ))}
          </Card>
        )}

        <Text style={{ color: c.text, fontWeight: "800" }}>Aapki details</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={c.muted} style={input} />
        <TextInput value={mobile} onChangeText={setMobile} placeholder="Mobile number" keyboardType="phone-pad" placeholderTextColor={c.muted} style={input} />
        <TextInput value={msg} onChangeText={setMsg} placeholder="Owner ko message (optional) — kab shift hona hai, kitne log" multiline placeholderTextColor={c.muted} style={[input, { minHeight: 80, textAlignVertical: "top" }]} />
        <ErrorText error={submit.error} />
        <Button title="Send booking request" busy={submit.isPending} disabled={!d || !allTicked || name.trim().length < 2 || mobile.replace(/\D/g, "").length < 10} onPress={() => submit.mutate()} />
        {!allTicked && <Text style={{ color: c.muted, fontSize: 12, textAlign: "center" }}>Request bhejne ke liye saare boxes tick karna zaroori hai.</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
