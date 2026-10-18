import React from "react";
import { ScrollView, Switch, View } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { api } from "@/lib/api";
import { inExpoGo } from "@/lib/push";
import { Card, Chip, ErrorText } from "@/components/ui";
import { useColors } from "@/theme";

type Prefs = { push_enabled: boolean; rent: boolean; bookings: boolean; maintenance: boolean; roommate: boolean; account: boolean; quiet_start: number | null; quiet_end: number | null; tz_offset_min: number };
type Key = "rent" | "bookings" | "maintenance" | "roommate" | "account";
const CATS: Array<[Key, string, string]> = [
  ["rent", "Rent & bills", "Bill, payment and meter updates"],
  ["bookings", "Bookings", "Booking requests and decisions"],
  ["maintenance", "Maintenance updates", "Status of your complaints"],
  ["roommate", "Roommate chat", "Messages and call invites"],
  ["account", "Account & verification", "Document review and account updates"],
];
const QUIET: Array<[string, number | null, number | null]> = [["Off", null, null], ["10 pm – 7 am", 22, 7], ["11 pm – 6 am", 23, 6], ["12 am – 8 am", 0, 8]];

export default function NotificationSettings() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["prefs"], queryFn: () => api<{ prefs: Prefs }>("notif/prefs") });
  const save = useMutation({
    mutationFn: (patch: Partial<Prefs>) => api<{ prefs: Prefs }>("notif/prefs/save", { ...patch, tz_offset_min: -new Date().getTimezoneOffset() }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: ["prefs"] });
      const prev = qc.getQueryData<{ prefs: Prefs }>(["prefs"]);
      if (prev) qc.setQueryData(["prefs"], { prefs: { ...prev.prefs, ...patch } });
      return { prev };
    },
    onError: (_e, _p, ctx) => { if (ctx?.prev) qc.setQueryData(["prefs"], ctx.prev); },
    onSuccess: (r) => { qc.setQueryData(["prefs"], r); void Haptics.selectionAsync(); },
  });
  const p = q.data?.prefs;
  const row = (title: string, sub: string, value: boolean, onChange: (v: boolean) => void, disabled?: boolean) => (
    <View key={title} style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, opacity: disabled ? 0.45 : 1 }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: c.text, fontWeight: "600" }}>{title}</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>{sub}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: c.primary }} />
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
      <ErrorText error={q.error ?? save.error} />
      {inExpoGo && <Card><Text style={{ color: c.warn }}>Push isn't available in Expo Go. It works in the installed app (APK).</Text></Card>}
      {p && (<>
        <Card>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 }}>Push notifications</Text>
          {row("Allow notifications on this phone", "Everything still shows in your Inbox even when a push is off.", p.push_enabled, (v) => save.mutate({ push_enabled: v }))}
        </Card>
        <Card>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700", marginBottom: 4 }}>WHAT TO NOTIFY ME ABOUT</Text>
          {CATS.map(([k, t, sub]) => row(t, sub, p[k], (v) => save.mutate({ [k]: v }), !p.push_enabled))}
        </Card>
        <Card style={{ gap: 8, opacity: p.push_enabled ? 1 : 0.45 }}>
          <Text style={{ color: c.muted, fontSize: 12, fontWeight: "700" }}>QUIET HOURS</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>No push during these hours — you'll get them after.</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 8 }}>
            {QUIET.map(([label, a, b]) => (
              <Chip key={label} label={label} active={p.quiet_start === a && p.quiet_end === b} onPress={() => p.push_enabled && save.mutate({ quiet_start: a, quiet_end: b })} />
            ))}
          </View>
        </Card>
      </>)}
    </ScrollView>
  );
}
