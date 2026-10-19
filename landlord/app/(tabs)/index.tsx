import React from "react";
import { Pressable, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, inr } from "@/theme";

type Home = {
  properties: number; rooms: number; beds: number; filled: number; vacant: number; due: number; overdue: number; collected: number;
  pending: { bookings: number; payments: number; meters: number; tickets: number };
};

export default function HomeTab() {
  const c = useColors();
  const router = useRouter();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ name: string | null; upi: string | null }>("l/me") });
  const q = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("l/home") });
  const d = q.data;
  const stat = (label: string, value: string, tone?: string) => (
    <Card style={{ flex: 1, minWidth: "46%", gap: 2 }}>
      <Text style={{ color: c.muted, fontSize: 12 }}>{label}</Text>
      <Text style={{ color: tone ?? c.text, fontSize: 20, fontWeight: "800" }}>{value}</Text>
    </Card>
  );
  const todo = (n: number, text: string, go: string) => n > 0 ? (
    <Pressable key={text} onPress={() => router.push(go as never)}>
      <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", borderColor: c.warn }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>{n} {text}</Text>
        <Text style={{ color: c.primary, fontWeight: "700" }}>Dekhein →</Text>
      </Card>
    </Pressable>
  ) : null;
  const items = d ? [
    todo(d.pending.bookings, "naye booking requests", "/requests"),
    todo(d.pending.payments, "payment proof verify karne hain", "/money"),
    todo(d.pending.meters, "tenant meter readings approve karni hain", "/money"),
    todo(d.pending.tickets, "complaints khuli hain", "/requests"),
  ].filter(Boolean) : [];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}>
      <View>
        <Text style={{ color: c.muted }}>Namaste</Text>
        <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>{me.data?.name ?? "Landlord"}</Text>
      </View>
      <ErrorText error={q.error} />
      {!d ? <SkeletonList n={3} height={80} /> : (<>
        {items.length ? items : <Card><Text style={{ color: c.muted }}>Abhi koi kaam pending nahi hai. 🎉</Text></Card>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
          {stat("Rooms / beds", `${d.rooms} / ${d.beds}`)}
          {stat("Bhare / khali beds", `${d.filled} / ${d.vacant}`)}
          {stat("Is mahine collect hua", inr(d.collected), c.ok)}
          {stat("Baaki rent", inr(d.due), d.due ? c.warn : c.text)}
          {stat("Overdue", inr(d.overdue), d.overdue ? c.danger : c.text)}
          {stat("Properties", String(d.properties))}
        </View>
        {d.properties === 0 ? (
          <Card style={{ gap: 6 }}>
            <Text style={{ color: c.text, fontWeight: "800" }}>Shuruaat karein</Text>
            <Text style={{ color: c.muted }}>1) Rooms tab mein property add karein  2) Room banayein  3) Terms, photos aur details bharke room list karein.</Text>
          </Card>
        ) : null}
        {me.data && !me.data.upi ? (
          <Pressable onPress={() => router.push("/profile" as never)}>
            <Card style={{ borderColor: c.warn }}><Text style={{ color: c.text, fontWeight: "700" }}>UPI ID add karein</Text><Text style={{ color: c.muted, fontSize: 12 }}>Bina UPI ID ke tenants rent nahi bhej paate aur room list nahi hoga.</Text></Card>
          </Pressable>
        ) : null}
      </>)}
      <Pressable onPress={() => router.push("/profile" as never)}><Text style={{ color: c.primary, fontWeight: "700", textAlign: "center", padding: 8 }}>Mera profile & sign out</Text></Pressable>
    </ScrollView>
  );
}
