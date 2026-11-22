import React, { useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  TextInput,
  View,
} from "react-native";
import { Stack } from "expo-router";
import { randomUUID } from "expo-crypto";
import { Ionicons } from "@expo/vector-icons";
import { Text } from "@/components/Text";
import { Button, Card, ErrorText } from "@/components/ui";
import { useColors } from "@/theme";
import { WEB } from "@/lib/api";

const categories = [
  ["booking", "Room or booking"],
  ["payments", "Rent or payment"],
  ["account", "My account"],
  ["technical", "App or website"],
  ["other", "Something else"],
] as const;
export default function Support() {
  const c = useColors();
  const id = useRef<string | null>(null);
  const [values, setValues] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [category, setCategory] = useState<string>("booking"),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  const field = (key: keyof typeof values, label: string, multi = false) => (
    <View style={{ gap: 7 }} key={key}>
      <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={values[key]}
        onChangeText={(v) => setValues((x) => ({ ...x, [key]: v }))}
        editable={!busy}
        multiline={multi}
        textAlignVertical={multi ? "top" : "center"}
        keyboardType={key === "email" ? "email-address" : key === "phone" ? "phone-pad" : "default"}
        autoCapitalize={key === "email" ? "none" : "sentences"}
        maxLength={
          key === "message"
            ? 4000
            : key === "email"
              ? 254
              : key === "phone"
                ? 20
                : key === "subject"
                  ? 150
                  : 100
        }
        placeholderTextColor={c.muted}
        style={{
          minHeight: multi ? 145 : 50,
          backgroundColor: c.bg,
          borderWidth: 1,
          borderColor: c.border,
          borderRadius: 14,
          padding: 14,
          color: c.text,
          fontSize: 15,
        }}
      />
    </View>
  );
  async function submit() {
    if (busy) return;
    if (
      values.name.trim().length < 2 ||
      !/^\S+@\S+\.\S+$/.test(values.email.trim()) ||
      values.subject.trim().length < 4 ||
      values.message.trim().length < 20 ||
      !consent
    ) {
      setError(
        "Name, valid email, subject (4+ characters), query (20+ characters) aur consent fill karein.",
      );
      return;
    }
    id.current ??= randomUUID();
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`${WEB}/api/support/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, category, consent, website: "", id: id.current }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok)
        throw new Error(data.error || "Query send nahi hui. Dobara try karein.");
      setReference(data.reference);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Connection interrupted. Dobara try karein.");
    } finally {
      setBusy(false);
    }
  }
  const link = (url: string) =>
    void Linking.openURL(url).catch(() => setError("Is link ko open nahi kar paye."));
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <Stack.Screen options={{ title: "Help & support" }} />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
      >
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.gold, fontSize: 11, fontWeight: "800", letterSpacing: 2 }}>
            RENTALOS SUPPORT
          </Text>
          <Text style={{ color: c.text, fontSize: 30, fontWeight: "800", letterSpacing: -0.6 }}>
            A little help.<Text style={{ color: c.muted }}>{"\n"}A smoother stay.</Text>
          </Text>
        </View>
        <Card style={{ backgroundColor: c.hero, borderColor: c.hero, gap: 12, padding: 22 }}>
          <Text style={{ color: c.goldLight, fontWeight: "700" }}>Here for your next step.</Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => link("mailto:support@rentalos.in")}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Ionicons name="mail-outline" color={c.goldLight} size={20} />
            <Text style={{ color: "#fff", flex: 1 }}>support@rentalos.in</Text>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => link("tel:+919252199283")}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}
          >
            <Ionicons name="call-outline" color={c.goldLight} size={20} />
            <Text style={{ color: "#fff" }}>+91 92521 99283</Text>
          </Pressable>
        </Card>
        {reference ? (
          <Card style={{ gap: 14 }}>
            <Ionicons name="checkmark-circle-outline" color={c.ok} size={40} />
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>
              Your query is on its way.
            </Text>
            <Text style={{ color: c.muted, lineHeight: 21 }}>
              Email service ne aapki query accept kar li hai. Hum aapke email par reply karenge.
            </Text>
            <Text selectable style={{ color: c.muted, fontSize: 12 }}>
              Reference: {reference}
            </Text>
            <Button
              title="Send another query"
              onPress={() => {
                id.current = null;
                setReference("");
                setValues({ name: "", email: "", phone: "", subject: "", message: "" });
                setConsent(false);
              }}
            />
          </Card>
        ) : (
          <Card style={{ gap: 18 }}>
            <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>Send a query</Text>
            {field("name", "Full name")}
            {field("email", "Email address")}
            {field("phone", "Phone (optional)")}
            <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
              What is this about?
            </Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {categories.map(([key, label]) => (
                <Pressable
                  key={key}
                  disabled={busy}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: category === key }}
                  onPress={() => setCategory(key)}
                  style={{
                    minHeight: 44,
                    justifyContent: "center",
                    paddingHorizontal: 13,
                    borderRadius: 12,
                    backgroundColor: category === key ? c.primary : c.soft,
                  }}
                >
                  <Text style={{ color: category === key ? c.onPrimary : c.text, fontSize: 12 }}>
                    {label}
                  </Text>
                </Pressable>
              ))}
            </View>
            {field("subject", "Subject")}
            {field("message", "Your query (20–4,000 characters)", true)}
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Switch
                accessibilityLabel="Consent to use details for this query"
                value={consent}
                disabled={busy}
                onValueChange={setConsent}
              />
              <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18, flex: 1 }}>
                RentalOS meri details is query ka jawab dene ke liye use kar sakta hai.
              </Text>
            </View>
            <ErrorText error={error || null} />
            <Button title="Send query" busy={busy} onPress={() => void submit()} />
          </Card>
        )}
        <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
          Booking ya bill reference ho toh include karein. Passwords, OTPs ya card details share na
          karein.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
