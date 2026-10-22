import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, dmy } from "@/theme";

type N = {
  id: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

/** Web link → app screen (exact when the link says so, keyword fallback otherwise). */
const LINKS: Array<[RegExp, string]> = [
  [/^\/meters?\b/, "/money?tab=meters"],
  [/payment-verify|^\/verify$/, "/money?tab=verify"],
  [/^\/bills/, "/money?tab=bills"],
  [/^\/deposits/, "/money?tab=deposits"],
  [/^\/bookings|^\/admin\/bookings/, "/requests?tab=book"],
  [/^\/maintenance/, "/requests?tab=tickets"],
  [/^\/tenants|^\/moves/, "/tenants"],
  [/^\/rooms|^\/properties|^\/rental-terms/, "/rooms"],
  [/^\/subscription/, "/subscription"],
  [/verify-identity|^\/verifications/, "/verification"],
];
function target(n: N): string {
  const l = (n.link ?? "").toLowerCase();
  for (const [re, to] of LINKS) if (re.test(l)) return to;
  const t = `${n.title} ${n.body ?? ""}`.toLowerCase();
  if (/meter/.test(t)) return "/money?tab=meters";
  if (/payment|proof/.test(t)) return "/money?tab=verify";
  if (/bill|rent|deposit/.test(t)) return "/money?tab=bills";
  if (/book|request/.test(t)) return "/requests?tab=book";
  if (/ticket|maintenance|complaint/.test(t)) return "/requests?tab=tickets";
  if (/tenant|move/.test(t)) return "/tenants";
  return "/";
}

export default function Notifications() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("myr_notifications")
        .select("id, title, body, link, created_at, read_at")
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as N[];
    },
  });
  const read = useMutation({
    mutationFn: (id: string | null) => api("notif/read", { id }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifs"] });
      qc.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });
  const unread = (q.data ?? []).filter((n) => !n.read_at).length;
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 10 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      {unread > 0 ? (
        <Button
          kind="ghost"
          title={`Sab ${unread} padhe hue mark karein`}
          onPress={() => read.mutate(null)}
        />
      ) : null}
      <ErrorText error={q.error ?? read.error} />
      {q.isLoading ? <SkeletonList n={4} height={80} /> : null}
      {q.data && !q.data.length ? <Empty text="Abhi koi notification nahi." /> : null}
      {q.data?.map((n) => (
        <Pressable
          key={n.id}
          onPress={() => {
            if (!n.read_at) read.mutate(n.id);
            router.push(target(n) as never);
          }}
        >
          <Card style={{ gap: 3, borderColor: n.read_at ? c.border : c.primary }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: n.read_at ? "600" : "800", flex: 1 }}>
                {n.title}
              </Text>
              {!n.read_at ? (
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: c.primary,
                    marginTop: 5,
                  }}
                />
              ) : null}
            </View>
            {n.body ? <Text style={{ color: c.muted, fontSize: 13 }}>{n.body}</Text> : null}
            <Text style={{ color: c.muted, fontSize: 11 }}>{dmy(n.created_at)}</Text>
          </Card>
        </Pressable>
      ))}
    </ScrollView>
  );
}
