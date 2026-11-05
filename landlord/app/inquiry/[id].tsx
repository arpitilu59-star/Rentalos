import React, { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, TextInput, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { useColors, R } from "@/theme";

type Msg = { id: string; body: string; created_at: string; mine: boolean };

export default function Inquiry() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const qc = useQueryClient();
  const scroll = useRef<ScrollView>(null);
  const [text, setText] = useState("");
  const q = useQuery({
    queryKey: ["inquiry", id],
    queryFn: () => api<{ title: string; messages: Msg[] }>("l/inquiry/messages", { id }),
    refetchInterval: 8000,
  });
  const send = useMutation({
    mutationFn: () => api("l/inquiry/send", { id, body: text.trim() }),
    onSuccess: () => {
      setText("");
      qc.invalidateQueries({ queryKey: ["inquiry", id] });
      qc.invalidateQueries({ queryKey: ["inquiries"] });
    },
  });
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        ref={scroll}
        contentContainerStyle={{ padding: 16, gap: 8 }}
        onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}
      >
        <Text style={{ color: c.muted, fontSize: 12, textAlign: "center" }}>
          {q.data?.title ?? ""}
        </Text>
        <ErrorText error={q.error ?? send.error} />
        {q.data?.messages.map((m) => (
          <View
            key={m.id}
            style={{
              alignSelf: m.mine ? "flex-end" : "flex-start",
              maxWidth: "82%",
              backgroundColor: m.mine ? c.primary : c.card,
              borderColor: c.border,
              borderWidth: m.mine ? 0 : 1,
              borderRadius: R.m,
              padding: 10,
            }}
          >
            <Text style={{ color: m.mine ? c.onPrimary : c.text }}>{m.body}</Text>
          </View>
        ))}
        {q.data && !q.data.messages.length ? (
          <Text style={{ color: c.muted, textAlign: "center" }}>Abhi koi message nahi.</Text>
        ) : null}
      </ScrollView>
      <View
        style={{
          flexDirection: "row",
          gap: 8,
          padding: 12,
          borderTopWidth: 1,
          borderColor: c.border,
        }}
      >
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Reply likhein…"
          placeholderTextColor={c.muted}
          multiline
          maxLength={2000}
          style={{
            flex: 1,
            color: c.text,
            borderColor: c.border,
            borderWidth: 1,
            borderRadius: R.m,
            paddingHorizontal: 12,
            paddingVertical: 8,
            maxHeight: 100,
          }}
        />
        <Button
          title="Bhejein"
          busy={send.isPending}
          disabled={!text.trim()}
          onPress={() => send.mutate()}
        />
      </View>
    </KeyboardAvoidingView>
  );
}
