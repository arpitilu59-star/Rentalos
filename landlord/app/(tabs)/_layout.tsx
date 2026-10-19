import React, { useEffect } from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useColors } from "@/theme";

type Home = { pending: { bookings: number; payments: number; meters: number; tickets: number } };

export default function TabsLayout() {
  const c = useColors();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ landlord: boolean }>("l/me") });
  const home = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("l/home"), enabled: me.data?.landlord === true, refetchInterval: 60_000 });
  // A tenant account must never sit inside the landlord app.
  useEffect(() => { if (me.data && !me.data.landlord) void supabase.auth.signOut(); }, [me.data]);
  const p = home.data?.pending;
  const badge = (n?: number) => (n && n > 0 ? n : undefined);
  const icon = (name: keyof typeof Ionicons.glyphMap) => ({ color, size }: { color: import("react-native").ColorValue; size: number }) => <Ionicons name={name} color={color} size={size} />;
  return (
    <Tabs screenOptions={{
      tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted,
      tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
      headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false,
      sceneStyle: { backgroundColor: c.bg },
    }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home-outline") }} />
      <Tabs.Screen name="rooms" options={{ title: "Rooms", tabBarIcon: icon("bed-outline") }} />
      <Tabs.Screen name="requests" options={{ title: "Requests", tabBarIcon: icon("mail-unread-outline"), tabBarBadge: badge((p?.bookings ?? 0) + (p?.tickets ?? 0)) }} />
      <Tabs.Screen name="tenants" options={{ title: "Tenants", tabBarIcon: icon("people-outline") }} />
      <Tabs.Screen name="money" options={{ title: "Money", tabBarIcon: icon("cash-outline"), tabBarBadge: badge((p?.payments ?? 0) + (p?.meters ?? 0)) }} />
    </Tabs>
  );
}
