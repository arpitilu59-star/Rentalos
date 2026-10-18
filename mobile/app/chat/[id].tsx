import React, { useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View, Pressable } from "react-native";
import { useLocalSearchParams, Stack } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as WebBrowser from "expo-web-browser";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

type Msg = { id: string; sender_id: string; kind: "text" | "call"; body: string; created_at: string };
type Thread = { me: string; status: string; incoming: boolean; name: string; messages: Msg[]; callUrl: string | null };

export default function Chat() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const list = useRef<FlatList<Msg>>(null);
  const q = useQuery({ queryKey: ["thread", id], queryFn: () => api<Thread>("roommate/thread", { threadId: id }), refetchInterval: 4000 });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["thread", id] }); qc.invalidateQueries({ queryKey: ["threads"] }); };
  const send = useMutation({ mutationFn: (body: string) => api("roommate/send", { threadId: id, body }), onSuccess: () => { setText(""); refresh(); } });
  const respond = useMutation({ mutationFn: (decision: string) => api("roommate/respond", { threadId: id, decision }), onSuccess: refresh });
  const call = useMutation({
    mutationFn: () => api<{ url: string }>("roommate/call", { threadId: id }),
    onSuccess: async (r) => { void Haptics.impactAsync(); refresh(); await WebBrowser.openBrowserAsync(r.url); },
  });
  useEffect(() => { setTimeout(() => list.current?.scrollToEnd({ animated: true }), 50); }, [q.data?.messages.length]);

  const d = q.data;
  const active = d?.status === "active";
  const err = q.error ?? send.error ?? respond.error ?? call.error;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <Stack.Screen options={{ title: d?.name ?? "Chat", headerRight: () => (
        <Pressable disabled={!active || call.isPending} onPress={() => call.mutate()} hitSlop={10} style={{ opacity: active ? 1 : 0.35, padding: 6 }}>
          <Ionicons name="videocam" size={26} color={c.primary} />
        </Pressable>
      ) }} />
      <FlatList
        ref={list}
        data={d?.messages ?? []}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: 14, gap: 8 }}
        renderItem={({ item: m }) => {
          const mine = m.sender_id === d?.me;
          if (m.kind === "call") return (
            <Pressable onPress={() => d?.callUrl && WebBrowser.openBrowserAsync(d.callUrl)} style={{ alignSelf: "center", backgroundColor: c.soft, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 99 }}>
              <Text style={{ color: c.primary, fontWeight: "700", fontSize: 12 }}>📹 {mine ? "You started" : `${d?.name} started`} a video call — tap to join</Text>
            </Pressable>
          );
          return (
            <View style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: "80%", backgroundColor: mine ? c.primary : c.card, borderColor: c.border, borderWidth: mine ? 0 : 1, borderRadius: R.l, paddingHorizontal: 13, paddingVertical: 9 }}>
              <Text style={{ color: mine ? c.onPrimary : c.text, fontSize: 15 }}>{m.body}</Text>
            </View>
          );
        }}
      />
      <ErrorText error={err} />
      {d?.incoming && (
        <View style={{ padding: 12, flexDirection: "row", gap: 8, backgroundColor: c.soft }}>
          <Button title="Accept" style={{ flex: 1 }} busy={respond.isPending} onPress={() => respond.mutate("accept")} />
          <Button title="Decline" kind="ghost" style={{ flex: 1 }} onPress={() => respond.mutate("decline")} />
        </View>
      )}
      {d?.status === "pending" && !d.incoming && <Text style={{ color: c.muted, textAlign: "center", padding: 10 }}>Request bhej di gayi — accept hote hi chat khulegi.</Text>}
      {d?.status === "blocked" && <Text style={{ color: c.muted, textAlign: "center", padding: 10 }}>Yeh chat blocked hai.</Text>}
      {active && (
        <View style={{ flexDirection: "row", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.card }}>
          <TextInput value={text} onChangeText={setText} placeholder="Message…" placeholderTextColor={c.muted} maxLength={2000} multiline
            style={{ flex: 1, color: c.text, backgroundColor: c.bg, borderRadius: R.l, paddingHorizontal: 14, paddingVertical: 9, maxHeight: 110, borderWidth: 1, borderColor: c.border }} />
          <Pressable disabled={!text.trim() || send.isPending} onPress={() => send.mutate(text.trim())} style={{ width: 44, borderRadius: 22, backgroundColor: c.primary, alignItems: "center", justifyContent: "center", opacity: !text.trim() || send.isPending ? 0.5 : 1 }}>
            <Ionicons name="send" size={19} color={c.onPrimary} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}
