import React, { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { Text } from "@/components/Text";
import { Stack, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { configured } from "@/lib/supabase";
import { useColors } from "@/theme";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 15_000 } } });

function Gate() {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const c = useColors();

  useEffect(() => {
    if (loading) return;
    const inLogin = segments[0] === "login";
    if (!session && !inLogin) router.replace("/login");
    if (session && inLogin) router.replace("/");
  }, [session, loading, segments, router]);

  if (!configured) {
    return (
      <View style={{ flex: 1, justifyContent: "center", padding: 24, backgroundColor: c.bg }}>
        <Text style={{ color: c.text, fontSize: 16 }}>
          App configured nahi hai. .env.example ko .env naam se copy karke EXPO_PUBLIC_SUPABASE_URL
          aur EXPO_PUBLIC_SUPABASE_ANON_KEY bharein, phir restart karein.
        </Text>
      </View>
    );
  }
  if (loading)
    return (
      <View
        style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.bg }}
      >
        <ActivityIndicator color={c.primary} size="large" />
      </View>
    );
  const head = {
    headerStyle: { backgroundColor: c.bg },
    headerTintColor: c.text,
    contentStyle: { backgroundColor: c.bg },
  };
  return (
    <Stack screenOptions={head}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="property-form" options={{ title: "Property" }} />
      <Stack.Screen name="room-form" options={{ title: "Room" }} />
      <Stack.Screen name="listing/[roomId]" options={{ title: "Room list karein" }} />
      <Stack.Screen name="terms/[propertyId]" options={{ title: "Rental terms" }} />
      <Stack.Screen name="photos" options={{ title: "Live photos" }} />
      <Stack.Screen name="tenant-form" options={{ title: "Tenant" }} />
      <Stack.Screen name="bill/[id]" options={{ title: "Bill" }} />
      <Stack.Screen name="tenant-statement" options={{ title: "Tenant statement" }} />
      <Stack.Screen name="terms-history" options={{ title: "Terms versions" }} />
      <Stack.Screen name="partner-import" options={{ title: "Partner import" }} />
      <Stack.Screen name="bill-new" options={{ title: "Naya bill" }} />
      <Stack.Screen name="meter-add" options={{ title: "Meter reading" }} />
      <Stack.Screen name="subscription" options={{ title: "Plan & features" }} />
      <Stack.Screen name="verification" options={{ title: "Verification" }} />
      <Stack.Screen name="settings" options={{ title: "Settings" }} />
      <Stack.Screen name="notifications" options={{ title: "Notifications" }} />
      <Stack.Screen name="deposit-form" options={{ title: "Deposit" }} />
      <Stack.Screen name="move-form" options={{ title: "Move-in / Move-out" }} />
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
