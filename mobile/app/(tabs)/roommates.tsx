import React, { useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { api } from "@/lib/api";
import { Button, Card, Empty, ErrorText, screen } from "@/components/ui";
import { useColors, inr } from "@/theme";

type Match = { user_id: string; display_name: string | null; age: number | null; occupation: string | null; city: string | null; bio: string | null; score: number; sharedTraits: string[]; budget_min: number | null; budget_max: number | null };

export default function Roommates() {
  const c = useColors();
  const router = useRouter();
  const q = useQuery({ queryKey: ["matches"], queryFn: () => api<{ matches: Match[]; profile: { looking_for_roommate?: boolean } | null }>("roommate/matches") });
  const start = useMutation({
    mutationFn: (m: Match) => api<{ threadId: string }>("roommate/start", { otherUserId: m.user_id, message: `Hi${m.display_name ? " " + m.display_name : ""}! Main bhi roommate dhoondh raha/rahi hu. Chat karein?` }),
    onSuccess: (r) => router.push({ pathname: "/chat/[id]", params: { id: r.threadId } }),
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const on = q.data?.profile?.looking_for_roommate;

  return (
    <ScrollView contentContainerStyle={screen.pad} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={c.primary} />}>
      <Text style={{ color: c.text, fontSize: 22, fontWeight: "800" }}>Find a roommate</Text>
      <Text style={{ color: c.muted }}>Aadaton ke hisaab se match. Chat aur video call app ke andar — aapka number ya email kisi ko nahi dikhta.</Text>
      <ErrorText error={q.error ?? start.error} />
      {!on && !q.isLoading && (
        <Card>
          <Text style={{ color: c.text, fontWeight: "700" }}>Pehle apna profile banayein</Text>
          <Text style={{ color: c.muted, marginTop: 4 }}>Budget, sone ka time, khana aur city batayein, phir matches dikhenge.</Text>
          <Button title="Create profile" style={{ marginTop: 12 }} onPress={() => router.push("/roommate-profile")} />
        </Card>
      )}
      {on && <Button kind="ghost" title="Edit my profile" onPress={() => router.push("/roommate-profile")} />}
      {on && q.data?.matches.length === 0 && <Empty text="Abhi koi match nahi. Jaise-jaise log judenge yahan dikhenge." />}
      {q.data?.matches.map((m) => (
        <Card key={m.user_id}>
          <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.text, fontWeight: "700", fontSize: 17 }}>{m.display_name ?? "Roommate"}{m.age ? `, ${m.age}` : ""}</Text>
              <Text style={{ color: c.muted }}>{m.occupation ?? m.city ?? ""}</Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={{ color: c.primary, fontSize: 22, fontWeight: "800" }}>{m.score}%</Text>
              <Text style={{ color: c.muted, fontSize: 11 }}>match</Text>
            </View>
          </View>
          {m.bio ? <Text style={{ color: c.text, marginTop: 8 }}>{m.bio}</Text> : null}
          {m.budget_min != null && m.budget_max != null && <Text style={{ color: c.muted, marginTop: 6 }}>Budget {inr(m.budget_min)} – {inr(m.budget_max)}</Text>}
          {m.sharedTraits.length > 0 && <Text style={{ color: c.primary, marginTop: 6, fontWeight: "600", fontSize: 12 }}>{m.sharedTraits.join(" · ")}</Text>}
          <Button title="Chat & video call" style={{ marginTop: 12 }} busy={busyId === m.user_id && start.isPending}
            onPress={() => { setBusyId(m.user_id); start.mutate(m); }} />
        </Card>
      ))}
    </ScrollView>
  );
}
