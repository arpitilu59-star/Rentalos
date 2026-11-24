import React, { useState } from "react";
import { Pressable, Switch, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { Card, ErrorText } from "@/components/ui";
import { useColors } from "@/theme";
import { api } from "@/lib/api";

type Metrics = {
  views: number;
  saves: number;
  requests: number;
  offers: number;
  bookings: number;
  video_completions: number;
};
type Prefs = { summary_frequency: "daily" | "weekly" | "off"; signals_enabled: boolean };
type Data = {
  totals: Metrics;
  rooms: Array<
    Metrics & { room_id: string; room_number: string; has_video: boolean; has_photos: boolean }
  >;
  preferences: Prefs;
};
export function InsightsCard() {
  const c = useColors();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["room-insights"], queryFn: () => api<Data>("l/insights") });
  const save = useMutation({
    mutationFn: (p: Prefs) => api("l/insights/preferences", p),
    onSuccess: () => q.refetch(),
  });
  const d = q.data;
  return (
    <View style={{ borderRadius: 24, overflow: "hidden", borderWidth: 1, borderColor: c.border }}>
      <View style={{ backgroundColor: c.hero, padding: 22, gap: 20 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text style={{ color: c.goldLight, fontWeight: "700", fontSize: 15, flex: 1 }}>
            Pichhle 7 din — aapke rooms
          </Text>
          <Ionicons name="stats-chart-outline" size={19} color={c.goldLight} />
        </View>
        {q.isError ? (
          <Pressable onPress={() => void q.refetch()} accessibilityRole="button">
            <Text style={{ color: "#fff", paddingVertical: 12 }}>
              Insights load nahi hue. Dobara try karein.
            </Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", gap: 12 }}>
            {[
              ["Dekha", d?.totals.views],
              ["Save", d?.totals.saves],
              ["Requests", d?.totals.requests],
            ].map(([label, value]) => (
              <View key={String(label)} style={{ flex: 1, alignItems: "center", gap: 5 }}>
                <Text
                  style={{
                    color: "#fff",
                    fontSize: 34,
                    fontWeight: "800",
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {value == null ? "—" : Number(value).toLocaleString("en-IN")}
                </Text>
                <Text style={{ color: "#b7c2dc", fontSize: 13 }}>{String(label)}</Text>
              </View>
            ))}
          </View>
        )}
        <View style={{ borderTopWidth: 1, borderTopColor: "#ffffff25", paddingTop: 13, gap: 10 }}>
          <Text style={{ color: "#b7c2dc", fontSize: 12, lineHeight: 18 }}>
            Sirf count, kaun aaya ye nahi dikhta. Ek viewer ka har room par ek view per day.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            style={{
              minHeight: 44,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: c.goldLight, fontWeight: "700", fontSize: 13 }}>
              {open ? "Details band karein" : "Room performance dekhein"}
            </Text>
            <Ionicons name={open ? "chevron-up" : "chevron-down"} color={c.goldLight} size={16} />
          </Pressable>
        </View>
      </View>
      {open && d && (
        <View style={{ backgroundColor: c.card, padding: 18, gap: 18 }}>
          <Text style={{ color: c.text, fontWeight: "800", fontSize: 17 }}>
            Views → saves → offers → bookings
          </Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            7-day activity counts. Ye conversion-rate report nahi hai.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
            {[
              ["Offers", d.totals.offers],
              ["Bookings", d.totals.bookings],
              ["Full video plays", d.totals.video_completions],
            ].map(([label, v]) => (
              <View
                key={label}
                style={{
                  backgroundColor: c.soft,
                  padding: 12,
                  borderRadius: 14,
                  minWidth: 90,
                  flex: 1,
                }}
              >
                <Text style={{ color: c.text, fontWeight: "800", fontSize: 21 }}>{v}</Text>
                <Text style={{ color: c.muted, fontSize: 11 }}>{label}</Text>
              </View>
            ))}
          </View>
          {d.rooms.length ? (
            d.rooms.map((r) => (
              <Card key={r.room_id} style={{ gap: 6 }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>Room {r.room_number}</Text>
                <Text style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
                  {r.views} views · {r.saves} saves · {r.offers} offers · {r.requests} requests ·{" "}
                  {r.bookings} bookings
                </Text>
                {r.views < 5 && (
                  <Text style={{ color: c.gold, fontSize: 12, lineHeight: 18 }}>
                    {!r.has_video
                      ? "Room ka clear video jodein."
                      : !r.has_photos
                        ? "Room photos add aur verify karein."
                        : "Price aur availability updated rakhein."}
                  </Text>
                )}
              </Card>
            ))
          ) : (
            <Text style={{ color: c.muted }}>
              Room publish karein. Real activity yahan dikhegi.
            </Text>
          )}
          <Text style={{ color: c.text, fontWeight: "700" }}>Summary notifications</Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["weekly", "daily", "off"] as const).map((f) => (
              <Pressable
                key={f}
                disabled={save.isPending}
                accessibilityRole="radio"
                accessibilityState={{ checked: d.preferences.summary_frequency === f }}
                onPress={() => save.mutate({ ...d.preferences, summary_frequency: f })}
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: d.preferences.summary_frequency === f ? c.primary : c.soft,
                }}
              >
                <Text
                  style={{
                    color: d.preferences.summary_frequency === f ? c.onPrimary : c.text,
                    textTransform: "capitalize",
                  }}
                >
                  {f}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: c.text, flex: 1 }}>Save & video notifications</Text>
            <Switch
              accessibilityLabel="Save and video notifications"
              value={d.preferences.signals_enabled}
              disabled={save.isPending}
              onValueChange={(v) => save.mutate({ ...d.preferences, signals_enabled: v })}
            />
          </View>
          <ErrorText error={save.error} />
        </View>
      )}
    </View>
  );
}
