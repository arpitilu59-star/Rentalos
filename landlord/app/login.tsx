import React, { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View, Pressable } from "react-native";
import { Text, TextInput } from "@/components/Text";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { useColors, R } from "@/theme";
import { Button, ErrorText } from "@/components/ui";

/** Landlord-only entry: sign-up creates a landlord account; sign-in refuses tenant accounts. */
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
      if (!email.trim() || pw.length < 6) throw new Error("Email aur kam se kam 6 akshar ka password likhein.");
      if (mode === "up") {
        if (name.trim().length < 2) throw new Error("Apna naam likhein.");
        const { data, error } = await supabase.auth.signUp({ email: email.trim(), password: pw, options: { data: { full_name: name.trim(), intended_role: "landlord" } } });
        if (error) throw new Error(error.message);
        if (!data.session) { setInfo("Account ban gaya. Email confirm karke sign in karein."); setMode("in"); return; }
        await api("l/claim");
        return;
      }
      const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw });
      if (error) throw new Error(error.message === "Invalid login credentials" ? "Email ya password galat hai." : error.message);
      const me = await api<{ landlord: boolean }>("l/me");
      if (!me.landlord) {
        await supabase.auth.signOut();
        throw new Error("Ye account tenant ka hai. RentDesk sirf landlords ke liye hai — tenant Rentalos app use karein. Landlord banna hai to 'Naya account' se landlord signup karein.");
      }
    } catch (e) { setErr(e); } finally { setBusy(false); }
  };
  const reset = async () => {
    setErr(null); setInfo("");
    if (!email.trim()) return setErr(new Error("Pehle email likhein."));
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    if (error) setErr(error); else setInfo("Password reset link email par bhej diya.");
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: "center", padding: 24, gap: 12 }} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: "center", marginBottom: 12 }}>
          <View style={{ width: 64, height: 64, borderRadius: 20, backgroundColor: c.primary, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ color: c.onPrimary, fontSize: 30, fontWeight: "800" }}>R</Text>
          </View>
          <Text style={{ color: c.text, fontSize: 26, fontWeight: "800", marginTop: 12 }}>RentDesk</Text>
          <Text style={{ color: c.muted, marginTop: 4, textAlign: "center" }}>Landlords ke liye — rooms, tenants aur rent ek jagah</Text>
        </View>
        {mode === "up" ? <TextInput value={name} onChangeText={setName} placeholder="Aapka naam" placeholderTextColor={c.muted} style={input} /> : null}
        <TextInput value={email} onChangeText={setEmail} placeholder="Email" placeholderTextColor={c.muted} autoCapitalize="none" keyboardType="email-address" style={input} />
        <TextInput value={pw} onChangeText={setPw} placeholder="Password" placeholderTextColor={c.muted} secureTextEntry style={input} />
        <ErrorText error={err} />
        {info ? <Text style={{ color: c.ok, fontSize: 13 }}>{info}</Text> : null}
        <Button title={mode === "in" ? "Sign in" : "Landlord account banayein"} busy={busy} onPress={submit} />
        <Pressable onPress={() => { setMode(mode === "in" ? "up" : "in"); setErr(null); }}><Text style={{ color: c.primary, textAlign: "center", fontWeight: "600" }}>{mode === "in" ? "Naya account banayein" : "Pehle se account hai? Sign in"}</Text></Pressable>
        {mode === "in" ? <Pressable onPress={reset}><Text style={{ color: c.muted, textAlign: "center" }}>Password bhool gaye?</Text></Pressable> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
