import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, Pressable } from "react-native";
import { Text, TextInput } from "@/components/Text";
import { supabase } from "@/lib/supabase";
import { useColors, R } from "@/theme";
import { LangPicker } from "@/components/LangPicker";
import { Button, ErrorText } from "@/components/ui";

export default function Login() {
  const c = useColors();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [info, setInfo] = useState("");

  const input = { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 13, color: c.text, fontSize: 15 } as const;

  const submit = async () => {
    setErr(null); setInfo(""); setBusy(true);
    try {
      if (!email.trim() || pw.length < 6) throw new Error("Enter your email and a password of at least 6 characters.");
      if (mode === "in") {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "Wrong email or password." : error.message);
      } else {
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name.trim() } } });
        if (error) throw new Error(error.message);
        if (!data.session) setInfo("Account created. Check your email to confirm, then sign in.");
      }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    setErr(null); setInfo("");
    if (!email.trim()) return setErr(new Error("Enter your email first."));
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setErr(error); else setInfo("Password reset link sent to your email.");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.onPrimary, fontSize: 30, fontWeight: "800" }}>R</Text>
          </View>
          <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginTop: 12 }}>Rentalos</Text>
          <Text style={{ color: c.muted, marginTop: 4 }}>Rooms, rent aur roommates — ek jagah</Text>
          <View style={{ marginTop: 10 }}><LangPicker /></View>
        </View>
        {mode === "up" && <TextInput style={input} placeholder="Full name" placeholderTextColor={c.muted} value={name} onChangeText={setName} />}
        <TextInput style={input} placeholder="Email" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail} />
        <TextInput style={input} placeholder="Password" placeholderTextColor={c.muted} secureTextEntry value={pw} onChangeText={setPw} />
        <ErrorText error={err} />
        {info ? <Text style={{ color: c.primary, fontSize: 13 }}>{info}</Text> : null}
        <Button title={mode === "in" ? "Sign in" : "Create account"} onPress={submit} busy={busy} />
        {mode === "in" && <Pressable onPress={reset}><Text style={{ color: c.muted, textAlign: "center", marginTop: 4 }}>Forgot password?</Text></Pressable>}
        <Pressable onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); setInfo(""); }}>
          <Text style={{ color: c.primary, textAlign: "center", marginTop: 8, fontWeight: "600" }}>{mode === "in" ? "New here? Create an account" : "Already have an account? Sign in"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
