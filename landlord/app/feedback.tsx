import React, { useState } from "react";
import { ScrollView, TextInput, View, Pressable } from "react-native";
import { Platform } from "react-native";
import Constants from "expo-constants";
import { Text } from "@/components/Text";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { useColors } from "@/theme";

const KINDS: Array<[string, string]> = [
  ["bug", "Kuch kaam nahi kar raha"],
  ["support", "Madad chahiye"],
  ["idea", "Suggestion"],
  ["other", "Other"],
];

export default function Feedback() {
  const c = useColors();
  const [kind, setKind] = useState("bug");
  const [body, setBody] = useState("");
  const send = useMutation({
    mutationFn: () =>
      api("feedback", { kind, body, platform: Platform.OS, appVersion: Constants.expoConfig?.version ?? null, screen: "RentDesk" }),
    onSuccess: () => setBody(""),
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>Help & feedback</Text>
        <Text style={{ color: c.muted, marginTop: 4 }}>Problem ya idea batayein. Password kabhi na likhein.</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          {KINDS.map(([k, label]) => (
            <Pressable
              key={k}
              onPress={() => setKind(k)}
              style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 99, borderWidth: 1, borderColor: c.border, backgroundColor: kind === k ? c.primary : "transparent" }}
            >
              <Text style={{ color: kind === k ? "#fff" : c.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={body}
          onChangeText={setBody}
          multiline
          maxLength={2000}
          placeholder="Yahan likhein…"
          placeholderTextColor={c.muted}
          style={{ marginTop: 12, minHeight: 120, borderWidth: 1, borderColor: c.border, borderRadius: 12, padding: 12, color: c.text, textAlignVertical: "top" }}
        />
        <ErrorText error={send.error} />
        {send.isSuccess ? <Text style={{ color: "#16a34a", marginTop: 8 }}>Dhanyavaad! Hume mil gaya.</Text> : null}
        <View style={{ marginTop: 12 }}>
          <Button title="Bhejein" busy={send.isPending} disabled={body.trim().length < 3} onPress={() => send.mutate()} />
        </View>
      </Card>
    </ScrollView>
  );
}
