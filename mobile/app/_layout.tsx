import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useColors } from "@/theme";
import { registerForPush } from "@/lib/push";
import { playVibe } from "@/lib/vibe";
import { biometricAvailable, getBiometricOn, unlock } from "@/lib/security";
import { Button } from "@/components/ui";
import { configured } from "@/lib/supabase";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();
  const [locked, setLocked] = useState(false);
  const [checked, setChecked] = useState(false);
  const played = useRef(false);

  // Welcome tone once per app open + optional fingerprint lock.
  useEffect(() => {
    (async () => {
      if (!played.current) { played.current = true; void playVibe(); }
      if (await biometricAvailable() && (await getBiometricOn())) {
        setLocked(true);
        if (await unlock()) setLocked(false);
      }
      setChecked(true);
    })();
  }, []);

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === "login";
    if (!session && !inAuth) router.replace("/login");
    if (session && inAuth) { router.replace("/"); void registerForPush(); }
    if (session && !inAuth) void registerForPush();
  }, [session, loading, segments, router]);

  // Tapping a push opens the right screen.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((r) => {
      const link = (r.notification.request.content.data as { link?: string } | undefined)?.link;
      if (link?.includes("roommate")) router.push("/(tabs)/inbox");
    });
    return () => sub.remove();
  }, [router]);

  if (!configured) {
    return <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.bg }}>
      <Text style={{ color: c.text, fontSize: 16 }}>App not configured. Copy .env.example to .env and fill EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart.</Text>
    </View>;
  }
  if (loading || !checked) return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}><ActivityIndicator color={c.primary} size="large" /></View>;
  if (locked) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: c.bg, padding: 24 }}>
      <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>Rentalos is locked</Text>
      <Button title="Unlock" onPress={async () => { if (await unlock()) setLocked(false); }} />
    </View>;
  }
  return (
    <Stack screenOptions={{ headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, contentStyle: { backgroundColor: c.bg } }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="room/[id]" options={{ title: "Room" }} />
      <Stack.Screen name="chat/[id]" options={{ title: "Chat" }} />
      <Stack.Screen name="roommate-profile" options={{ title: "My roommate profile" }} />
    </Stack>
  );
}

export default function Root() {
  return (
    <QueryClientProvider client={qc}>
      <AuthProvider>
        <StatusBar style="auto" />
        <Gate />
      </AuthProvider>
    </QueryClientProvider>
  );
}
