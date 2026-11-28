import React, { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import { Text } from "@/components/Text";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { useColors } from "@/theme";
import { registerForPush, listenForNotificationTaps } from "@/lib/push";
import { playVibe } from "@/lib/vibe";
import { biometricAvailable, getBiometricOn, unlock } from "@/lib/security";
import { Button } from "@/components/ui";
import { configured } from "@/lib/supabase";
import { LangProvider, useT } from "@/lib/i18n";
import { routeForLink } from "@/lib/links";
import { OnboardingProvider, useOnboarding } from "@/lib/onboarding";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 20_000 } } });

function Gate() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const c = useColors();
  const t = useT();
  const { done: onboarded } = useOnboarding();
  const [lock, setLock] = useState<"checking" | "open" | "locked" | "error">("checking");
  const [attempt, setAttempt] = useState(0);
  const played = useRef(false);
  const userId = session?.user.id;
  const ready = configured && !loading && onboarded !== null && lock === "open";
  useEffect(() => {
    let active = true;
    async function checkLock() {
      try {
        const enabled = await getBiometricOn();
        const needsUnlock = enabled && (await biometricAvailable());
        if (!active) return;
        const granted = !needsUnlock || (await unlock());
        if (active) setLock(granted ? "open" : "locked");
      } catch {
        if (active) setLock("error");
      }
    }
    void checkLock();
    return () => {
      active = false;
    };
  }, [attempt]);

  useEffect(() => {
    if (lock === "open" && !played.current) {
      played.current = true;
      void playVibe();
    }
  }, [lock]);

  useEffect(() => {
    if (lock === "open" && userId) void registerForPush();
  }, [lock, userId]);

  useEffect(() => {
    if (!ready || !userId) return;
    return listenForNotificationTaps((link) => router.push(routeForLink(link) as never));
  }, [ready, userId, router]);

  if (!configured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.bg }}>
        <Text style={{ color: c.text, fontSize: 16 }}>
          App not configured. Copy .env.example to .env and fill EXPO_PUBLIC_SUPABASE_URL and
          EXPO_PUBLIC_SUPABASE_ANON_KEY, then restart.
        </Text>
      </View>
    );
  }
  if (loading || lock === "checking" || onboarded === null)
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  if (lock !== "open") {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          backgroundColor: c.bg,
          padding: 24,
        }}
      >
        <Text style={{ color: c.text, fontSize: 20, fontWeight: "700" }}>
          {lock === "error" ? "Could not check your device lock." : "Rentalos is locked"}
        </Text>
        <Button
          title={lock === "error" ? "Try again" : "Unlock"}
          onPress={() => {
            setLock("checking");
            setAttempt((value) => value + 1);
          }}
        />
      </View>
    );
  }
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.text,
        contentStyle: { backgroundColor: c.bg },
      }}
    >
      <Stack.Protected guard={!session && !onboarded}>
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="stay" options={{ title: t("My stay") }} />
        <Stack.Screen name="meter" options={{ title: t("Meter reading") }} />
        <Stack.Screen
          name="notification-settings"
          options={{ title: t("Notification settings") }}
        />
        <Stack.Screen name="documents" options={{ title: t("Documents") }} />
        <Stack.Screen name="room/[id]" options={{ title: t("Room") }} />
        <Stack.Screen name="chat/[id]" options={{ title: t("Chat") }} />
        <Stack.Screen name="book/[roomId]" options={{ title: t("Book this room") }} />
        <Stack.Screen name="bookings" options={{ title: t("My requests") }} />
        <Stack.Screen name="bills" options={{ title: t("Rent & bills") }} />
        <Stack.Screen name="pay/[billId]" options={{ title: t("Pay rent") }} />
        <Stack.Screen name="maintenance" options={{ title: t("Maintenance") }} />
        <Stack.Screen name="saved" options={{ title: t("Saved rooms") }} />
        <Stack.Screen name="roommate-profile" options={{ title: t("My roommate profile") }} />
        <Stack.Screen name="feedback" />
        <Stack.Screen name="support" />
      </Stack.Protected>
    </Stack>
  );
}

export default function Root() {
  return (
    <QueryClientProvider client={qc}>
      <LangProvider>
        <AuthProvider>
          <StatusBar style="auto" />
          <OnboardingProvider>
            <Gate />
          </OnboardingProvider>
        </AuthProvider>
      </LangProvider>
    </QueryClientProvider>
  );
}
