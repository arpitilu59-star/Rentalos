import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, inr, dmy } from "@/theme";

type Home = {
  upcoming: Array<{ id: string; due_date: string; left: number; tenant: string; room: string }>;
  recent: Array<{ id: string; title: string; body: string | null; created_at: string }>;
  properties: number;
  rooms: number;
  beds: number;
  filled: number;
  vacant: number;
  due: number;
  overdue: number;
  collected: number;
  pending: { bookings: number; payments: number; meters: number; tickets: number };
};

export default function HomeTab() {
  const c = useColors();
  const router = useRouter();
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () => api<{ name: string | null; upi: string | null }>("l/me"),
  });
  const q = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("l/home") });
  const d = q.data;
  const stat = (label: string, value: string, go: string, tone?: string) => (
    <Pressable
      style={{ flex: 1, minWidth: "46%" }}
      onPress={() => router.push(go as never)}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
    >
      <Card style={{ gap: 2 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
        <Text style={{ color: tone ?? c.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
      </Card>
    </Pressable>
  );
  const todo = (
    n: number,
    text: string,
    go: string,
    tone: string,
    icon: keyof typeof Ionicons.glyphMap,
  ) =>
    n > 0 ? (
      <Pressable key={text} onPress={() => router.push(go as never)} accessibilityRole="button">
        <Card
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            borderLeftWidth: 4,
            borderLeftColor: tone,
          }}
        >
          <Ionicons name={icon} size={22} color={tone} />
          <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>{text}</Text>
          <Ionicons name="chevron-forward" size={18} color={c.muted} />
        </Card>
      </Pressable>
    ) : null;
  // Highest-priority first: money overdue → verify payments → new bookings → meters → complaints.
  const items = d
    ? [
        todo(
          d.overdue > 0 ? 1 : 0,
          `${inr(d.overdue)} rent overdue hai`,
          "/money",
          c.danger,
          "alert-circle-outline",
        ),
        todo(
          d.pending.payments,
          `${d.pending.payments} payment proof verify karne hain`,
          "/money",
          c.warn,
          "shield-checkmark-outline",
        ),
        todo(
          d.pending.bookings,
          `${d.pending.bookings} naye booking requests`,
          "/requests",
          c.warn,
          "mail-unread-outline",
        ),
        todo(
          d.pending.meters,
          `${d.pending.meters} meter readings approve karni hain`,
          "/money",
          c.warn,
          "speedometer-outline",
        ),
        todo(
          d.pending.tickets,
          `${d.pending.tickets} complaints khuli hain`,
          "/requests",
          c.primary,
          "construct-outline",
        ),
      ].filter(Boolean)
    : [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <View>
        <Text style={{ color: c.muted }}>Namaste</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>
          {me.data?.name ?? "Landlord"}
        </Text>
      </View>
      <ErrorText error={q.error} />
      {!d ? (
        <SkeletonList n={3} height={80} />
      ) : (
        <>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Action required</Text>
          {items.length ? (
            items
          ) : (
            <Card>
              <Text style={{ color: c.muted }}>Abhi koi kaam pending nahi hai. 🎉</Text>
            </Card>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
            {stat("Rooms / beds", `${d.rooms} / ${d.beds}`, "/rooms")}
            {stat("Bhare / khali beds", `${d.filled} / ${d.vacant}`, "/tenants")}
            {stat("Is mahine collect hua", inr(d.collected), "/money", c.ok)}
            {stat("Baaki rent", inr(d.due), "/money", d.due ? c.warn : c.text)}
            {stat("Overdue", inr(d.overdue), "/money", d.overdue ? c.danger : c.text)}
            {stat("Properties", String(d.properties), "/rooms")}
          </View>
          {d.upcoming.length ? (
            <>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
                Agle 7 din mein due
              </Text>
              {d.upcoming.map((u) => (
                <Pressable key={u.id} onPress={() => router.push("/money" as never)}>
                  <Card style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.text, flex: 1 }}>
                      {u.tenant} · Room {u.room}
                    </Text>
                    <Text style={{ color: c.text, fontWeight: "700" }}>
                      {inr(u.left)} · {dmy(u.due_date)}
                    </Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
          {d.recent.length ? (
            <>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
                Haal ki activity
              </Text>
              {d.recent.map((r) => (
                <Pressable key={r.id} onPress={() => router.push("/notifications" as never)}>
                  <Card style={{ gap: 2 }}>
                    <Text style={{ color: c.text, fontWeight: "700" }}>{r.title}</Text>
                    <Text style={{ color: c.muted, fontSize: 12 }}>{dmy(r.created_at)}</Text>
                  </Card>
                </Pressable>
              ))}
            </>
          ) : null}
          {d.properties === 0 ? (
            <Card style={{ gap: 6 }}>
              <Text style={{ color: c.text, fontWeight: "800" }}>Shuruaat karein</Text>
              <Text style={{ color: c.muted }}>
                1) Rooms tab mein property add karein 2) Room banayein 3) Terms, photos aur details
                bharke room list karein.
              </Text>
            </Card>
          ) : null}
          {me.data && !me.data.upi ? (
            <Pressable onPress={() => router.push("/settings" as never)}>
              <Card style={{ borderColor: c.warn }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>UPI ID add karein</Text>
                <Text style={{ color: c.muted, fontSize: 12 }}>
                  Bina UPI ID ke tenants rent nahi bhej paate aur room list nahi hoga.
                </Text>
              </Card>
            </Pressable>
          ) : null}
        </>
      )}
      <Pressable onPress={() => router.push("/settings" as never)}>
        <Text style={{ color: c.primary, fontWeight: "700", textAlign: "center", padding: 8 }}>
          Settings
        </Text>
      </Pressable>
    </ScrollView>
  );
}
