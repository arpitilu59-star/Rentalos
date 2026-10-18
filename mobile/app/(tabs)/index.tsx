import React from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText, screen } from "@/components/ui";
import { useColors, inr } from "@/theme";

type Home = {
  name: string | null;
  tenancies: Array<{ id: string; rooms: { room_number: string; rent_amount: number; properties: { name: string; myr_city: string | null; city: string | null } | null } | null }>;
  outstanding: number;
  nextDue: { total_amount: number; amount_paid: number; due_date: string } | null;
  pendingBookings: Array<{ id: string; status: string; rooms: { room_number: string; rent_amount: number; properties: { name: string } | null } | null }>;
};

export default function HomeTab() {
  const c = useColors();
  const router = useRouter();
  const q = useQuery({ queryKey: ["home"], queryFn: () => api<Home>("home") });
  const d = q.data;
  const due = d?.nextDue ? (d.nextDue.total_amount ?? 0) - (d.nextDue.amount_paid ?? 0) : 0;

  return (
    <ScrollView contentContainerStyle={screen.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={c.primary} />}>
      <Text style={{ color: c.text, fontSize: 24, fontWeight: "800" }}>Hi{d?.name ? `, ${d.name.split(" ")[0]}` : ""} 👋</Text>
      <ErrorText error={q.error} />
      {d && d.tenancies.length > 0 && (
        <Card style={{ backgroundColor: due > 0 ? c.soft : c.card }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>{due > 0 ? "RENT DUE" : "ALL CLEAR"}</Text>
          <Text style={{ color: c.text, fontSize: 34, fontWeight: "800", marginTop: 4 }}>{due > 0 ? inr(due) : "No dues 🎉"}</Text>
          {d.nextDue && due > 0 && <Text style={{ color: c.muted, marginTop: 2 }}>Due {new Date(d.nextDue.due_date).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}</Text>}
          {due > 0 && <Button title="Pay rent" style={{ marginTop: 14 }} onPress={() => router.push("/bills")} />}
        </Card>
      )}
      {d?.tenancies.map((t) => (
        <Card key={t.id}>
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>{t.rooms?.properties?.name ?? "Your room"}</Text>
          <Text style={{ color: c.muted, marginTop: 2 }}>Room {t.rooms?.room_number} · {inr(t.rooms?.rent_amount)}/mo · {t.rooms?.properties?.myr_city || t.rooms?.properties?.city}</Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
            <Button kind="ghost" title="Bills" style={{ flex: 1 }} onPress={() => router.push("/bills")} />
            <Button kind="ghost" title="Maintenance" style={{ flex: 1 }} onPress={() => router.push("/maintenance")} />
          </View>
        </Card>
      ))}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Button kind="ghost" title="❤ Saved" style={{ flex: 1 }} onPress={() => router.push("/saved")} />
        <Button kind="ghost" title="My requests" style={{ flex: 1 }} onPress={() => router.push("/bookings")} />
      </View>
      {d && d.pendingBookings.length > 0 && (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>BOOKING REQUESTS</Text>
          {d.pendingBookings.map((b) => (
            <Card key={b.id}>
              <Text style={{ color: c.text, fontWeight: "600" }}>{b.rooms?.properties?.name} · Room {b.rooms?.room_number}</Text>
              <Text style={{ color: b.status === "rejected" ? c.danger : c.warn, marginTop: 2, textTransform: "capitalize" }}>{b.status}</Text>
            </Card>
          ))}
        </View>
      )}
      {d && d.tenancies.length === 0 && d.pendingBookings.length === 0 && (
        <Card>
          <Text style={{ color: c.text, fontWeight: "700", fontSize: 17 }}>Apna room dhoondhein</Text>
          <Text style={{ color: c.muted, marginTop: 4 }}>Verified owners ke rooms, live photos aur video ke saath. Koi brokerage nahi.</Text>
          <Button title="Explore rooms" style={{ marginTop: 12 }} onPress={() => router.push("/(tabs)/explore")} />
        </Card>
      )}
      <Card>
        <Text style={{ color: c.text, fontWeight: "700", fontSize: 16 }}>Roommate chahiye?</Text>
        <Text style={{ color: c.muted, marginTop: 4 }}>Apni aadaton se match karein. Chat aur video call app ke andar — number share nahi hota.</Text>
        <Button kind="ghost" title="Find a roommate" style={{ marginTop: 12 }} onPress={() => router.push("/(tabs)/roommates")} />
      </Card>
    </ScrollView>
  );
}
