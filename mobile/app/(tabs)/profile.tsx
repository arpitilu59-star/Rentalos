import React, { useEffect, useState } from "react";
import { Alert, Linking, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { WEB } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button, Card, screen } from "@/components/ui";
import { api } from "@/lib/api";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useColors, R } from "@/theme";
import { biometricAvailable, getBiometricOn, setBiometricOn, unlock } from "@/lib/security";
import { isVibeMuted, setVibeMuted, playVibe } from "@/lib/vibe";

export default function Profile() {
  const c = useColors();
  const router = useRouter();
  const { session } = useAuth();
  const [bio, setBio] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const [sound, setSound] = useState(true);
  const qc = useQueryClient();
  const home = useQuery({ queryKey: ["home"], queryFn: () => api<{ name: string | null }>("home") });
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (home.data?.name) setName((n) => n || home.data!.name!); }, [home.data?.name]);
  const saveName = async () => { setSaving(true); try { await api("profile/name", { name }); await qc.invalidateQueries({ queryKey: ["home"] }); Alert.alert("Naam save ho gaya"); } catch (e) { Alert.alert("Error", e instanceof Error ? e.message : "Try again"); } setSaving(false); };
  useEffect(() => { (async () => { setBioOk(await biometricAvailable()); setBio(await getBiometricOn()); setSound(!(await isVibeMuted())); })(); }, []);

  const row = (label: string, sub: string, value: boolean, on: (v: boolean) => void, disabled?: boolean) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 8, opacity: disabled ? 0.5 : 1 }}>
      <View style={{ flex: 1, paddingRight: 12 }}><Text style={{ color: c.text, fontWeight: "600" }}>{label}</Text><Text style={{ color: c.muted, fontSize: 12 }}>{sub}</Text></View>
      <Switch value={value} onValueChange={on} disabled={disabled} trackColor={{ true: c.primary }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={screen.pad}>
      <Card>
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>SIGNED IN AS</Text>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "700", marginTop: 3 }}>{session?.user.email}</Text>
      </Card>
      <Card style={{ gap: 8 }}>
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>MERA NAAM</Text>
        <TextInput value={name} onChangeText={setName} placeholder="Aapka poora naam" placeholderTextColor={c.muted} style={{ backgroundColor: c.bg, borderColor: c.border, borderWidth: 1, borderRadius: R.m, padding: 12, color: c.text }} />
        <Button title="Naam save karein" busy={saving} disabled={name.trim().length < 2} onPress={saveName} />
      </Card>
      <Card>
        {row("Fingerprint / face lock", bioOk ? "App kholte waqt unlock maange" : "Is phone par set nahi hai", bio, async (v) => {
          if (v && !(await unlock())) return;
          await setBiometricOn(v); setBio(v);
        }, !bioOk)}
        {row("Welcome sound", "App kholte hi halki si vibe tone", sound, async (v) => { setSound(v); await setVibeMuted(!v); if (v) void playVibe(true); })}
      </Card>
      <Button kind="ghost" title="Rent & bills" onPress={() => router.push("/bills")} />
      <Button kind="ghost" title="Documents & receipts" onPress={() => router.push("/documents")} />
      <Button kind="ghost" title="Meter reading bhejein" onPress={() => router.push("/meter")} />
      <Button kind="ghost" title="Maintenance complaints" onPress={() => router.push("/maintenance")} />
      <Button kind="ghost" title="Saved rooms" onPress={() => router.push("/saved")} />
      <Button kind="ghost" title="My booking requests" onPress={() => router.push("/bookings")} />
      <Button kind="ghost" title="My roommate profile" onPress={() => router.push("/roommate-profile")} />
      <Button kind="ghost" title="Open full website" onPress={() => Linking.openURL(WEB)} />
      <Button kind="danger" title="Sign out" onPress={() => Alert.alert("Sign out?", "", [{ text: "Cancel", style: "cancel" }, { text: "Sign out", style: "destructive", onPress: () => supabase.auth.signOut() }])} />
    </ScrollView>
  );
}
