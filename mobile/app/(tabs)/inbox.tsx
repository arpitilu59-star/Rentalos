import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { useT } from "@/lib/i18n";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { routeForLink } from "@/lib/links";
import { Button } from "@/components/ui";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Card, Empty, ErrorText, screen } from "@/components/ui";
import { useColors } from "@/theme";

type Thread = { id: string; status: string; incoming: boolean; outgoing: boolean; name: string; last_message: string | null; last_message_at: string };
type Notif = { id: string; title: string; body: string | null; link: string | null; created_at: string; read_at: string | null };

export default function Inbox() {
  const c = useColors();
  const t = useT();
  const router = useRouter();
  const threads = useQuery({ queryKey: ["threads"], queryFn: () => api<Thread[]>("roommate/threads"), refetchInterval: 15000 });
  const notifs = useQuery({
    queryKey: ["notifs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("myr_notifications").select("id, title, body, link, created_at, read_at").order("created_at", { ascending: false }).limit(30);
      if (error) throw new Error(error.message);
      return (data ?? []) as Notif[];
    },
  });
  const qc = useQueryClient();
  const read = useMutation({ mutationFn: (id: string | null) => api("notif/read", { id }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["notifs"] }); qc.invalidateQueries({ queryKey: ["unread-count"] }); } });
  const unread = (notifs.data ?? []).filter((n) => !n.read_at).length;
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
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
        <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>{t("NOTIFICATIONS")}{unread ? ` (${unread} ${t("new")})` : ""}</Text>
        {unread > 0 && <Button kind="ghost" title="Sab padh liye" onPress={() => read.mutate(null)} />}
      </View>
      <ErrorText error={notifs.error} />
      {notifs.data?.length === 0 && <Empty text="Koi notification nahi." />}
      {notifs.data?.map((n) => (
        <Pressable key={n.id} onPress={() => { if (!n.read_at) read.mutate(n.id); router.push(routeForLink(n.link) as never); }}>
          <Card style={{ opacity: n.read_at ? 0.6 : 1, borderColor: n.read_at ? c.border : c.primary }}>
            <Text style={{ color: c.text, fontWeight: n.read_at ? "600" : "800" }}>{n.title}</Text>
            {n.body ? <Text style={{ color: c.muted, marginTop: 2 }}>{n.body}</Text> : null}
            <Text style={{ color: c.muted, fontSize: 11, marginTop: 4 }}>{new Date(n.created_at).toLocaleString("en-IN")}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
