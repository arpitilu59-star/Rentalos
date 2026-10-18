import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme";
import { useT } from "@/lib/i18n";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) => ({ color, size }: { color: import("react-native").ColorValue; size: number }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const c = useColors();
  const t = useT();
  const unread = useQuery({
    queryKey: ["unread-count"], refetchInterval: 30000,
    queryFn: async () => { const { count } = await supabase.from("myr_notifications").select("id", { count: "exact", head: true }).is("read_at", null); return count ?? 0; },
  });
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 62, paddingBottom: 8, paddingTop: 6 }, tabBarLabelStyle: { fontSize: 11 },
      headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" options={{ title: t("Home"), tabBarIcon: icon("home") }} />
      <Tabs.Screen name="explore" options={{ title: t("Explore"), tabBarIcon: icon("search") }} />
      <Tabs.Screen name="verify" options={{ title: t("Verify"), tabBarIcon: icon("shield-checkmark") }} />
      <Tabs.Screen name="roommates" options={{ title: t("Roommates"), tabBarIcon: icon("people") }} />
      <Tabs.Screen name="inbox" options={{ title: t("Inbox"), tabBarIcon: icon("chatbubbles"), tabBarBadge: unread.data ? unread.data : undefined }} />
      <Tabs.Screen name="profile" options={{ title: t("Profile"), tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
