import React, { useEffect, useState } from "react";
import { Switch, View } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Field } from "@/lib/ui2";
import { useColors, inr } from "@/theme";

type S = { rent: number; offers_enabled: boolean; min_rent: number | null; auto_approve: boolean };

/** Per-room negotiation settings. The minimum (floor) is private: the server never sends it to tenants. */
export function OfferSettings({ roomId }: { roomId: string }) {
  const c = useColors();
  const q = useQuery({ queryKey: ["offer-settings", roomId], queryFn: () => api<S>("l/offer/settings", { room_id: roomId }) });
  const [on, setOn] = useState(false);
  const [min, setMin] = useState("");
  const [auto, setAuto] = useState(false);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (q.data) {
      setOn(q.data.offers_enabled);
      setMin(q.data.min_rent != null ? String(q.data.min_rent) : "");
      setAuto(q.data.auto_approve);
    }
  }, [q.data]);
  const save = useMutation({
    mutationFn: () =>
      api("l/offer/settings/save", {
        room_id: roomId,
        offers_enabled: on,
        min_rent: min.trim() ? Number(min.replace(/[^\d]/g, "")) : null,
        auto_approve: auto,
      }),
    onSuccess: () => {
      setSaved(true);
      void q.refetch();
    },
  });
  return (
    <Card style={{ gap: 10 }}>
      <Text style={{ color: c.text, fontWeight: "800" }}>Tenant offers (negotiation)</Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: c.text, flex: 1, paddingRight: 8 }}>Is room par tenants ko offer dene dein</Text>
        <Switch value={on} onValueChange={(v) => { setOn(v); setSaved(false); }} />
      </View>
      {on ? (
        <>
          <Field
            label="Aapka minimum rent (floor) — tenant ko kabhi nahi dikhega"
            value={min}
            onChange={(v) => { setMin(v); setSaved(false); }}
            keyboard="numeric"
            placeholder={q.data?.rent ? `jaise ${Math.round(q.data.rent * 0.9)} (listed ${inr(q.data.rent)})` : "minimum rent"}
          />
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ color: c.text, flex: 1, paddingRight: 8, fontSize: 13 }}>
              Floor ya upar ke offer ka rent auto-approve karein (booking aap phir bhi khud accept karenge)
            </Text>
            <Switch value={auto} onValueChange={(v) => { setAuto(v); setSaved(false); }} />
          </View>
        </>
      ) : null}
      <ErrorText error={q.error ?? save.error} />
      {saved ? <Text style={{ color: c.ok }}>Offer settings save ho gayi.</Text> : null}
      <Button title="Offer settings save karein" busy={save.isPending} onPress={() => save.mutate()} />
    </Card>
  );
}
