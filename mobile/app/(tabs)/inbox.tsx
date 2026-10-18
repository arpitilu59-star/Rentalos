import React from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Card, Empty, ErrorText, screen } from "@/components/ui";
import { useColors } from "@/theme";

type Thread = { id: string; status: string; incoming: boolean; outgoing: boolean; name: string; last_message: string | null; last_message_at: string };
type Notif = { id: string; title: string; body: string | null; created_at: string; read_at: string | null };

export default function Inbox() {
  const c = useColors();
  const router = useRouter();
  const threads = useQuery({ queryKey: ["threads"], queryFn: () => api<Thread[]>("roommate/threads"), refetchInterval: 15000 });
  const notifs = useQuery({
    queryKey: ["notifs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("myr_notifications").select("id, title, body, created_at, read_at").order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as Notif[];
    },
  });
  const refreshing = threads.isRefetching || notifs.isRefetching;
  return (
    <ScrollView contentContainerStyle={screen.pad} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { threads.refetch(); notifs.refetch(); }} tintColor={c.primary} />}>
      <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>ROOMMATE CHATS</Text>
      <ErrorText error={threads.error} />
      {threads.data?.length === 0 && <Empty text="Abhi koi chat nahi. Roommates tab se shuru karein." />}
      {threads.data?.map((t) => (
        <Pressable key={t.id} onPress={() => router.push({ pathname: "/chat/[id]", params: { id: t.id } })}>
          <Card>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{t.name}</Text>
              {t.incoming && <Text style={{ color: c.onPrimary, backgroundColor: c.primary, paddingHorizontal: 8, borderRadius: 99, fontSize: 11, overflow: "hidden", paddingVertical: 2 }}>New request</Text>}
              {t.outgoing && <Text style={{ color: c.muted, fontSize: 12 }}>Waiting</Text>}
            </View>
            <Text style={{ color: c.muted, marginTop: 3 }} numberOfLines={1}>{t.last_message}</Text>
          </Card>
        </Pressable>
      ))}
      <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12, marginTop: 10 }}>NOTIFICATIONS</Text>
      <ErrorText error={notifs.error} />
      {notifs.data?.length === 0 && <Empty text="Koi notification nahi." />}
      {notifs.data?.map((n) => (
        <Card key={n.id} style={{ opacity: n.read_at ? 0.65 : 1 }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>{n.title}</Text>
          {n.body ? <Text style={{ color: c.muted, marginTop: 2 }}>{n.body}</Text> : null}
        </Card>
      ))}
    </ScrollView>
  );
}
