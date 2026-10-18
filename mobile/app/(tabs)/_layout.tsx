import React from "react";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "@/theme";

const icon = (name: React.ComponentProps<typeof Ionicons>["name"]) => ({ color, size }: { color: string; size: number }) => <Ionicons name={name} size={size} color={color} />;

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: c.primary, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border, height: 62, paddingBottom: 8, paddingTop: 6 },
      headerStyle: { backgroundColor: c.bg }, headerTintColor: c.text, headerShadowVisible: false }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home") }} />
      <Tabs.Screen name="explore" options={{ title: "Explore", tabBarIcon: icon("search") }} />
      <Tabs.Screen name="roommates" options={{ title: "Roommates", tabBarIcon: icon("people") }} />
      <Tabs.Screen name="inbox" options={{ title: "Inbox", tabBarIcon: icon("chatbubbles") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person") }} />
    </Tabs>
  );
}
