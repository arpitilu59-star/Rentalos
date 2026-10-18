import React from "react";
import { ScrollView, Share, View } from "react-native";
import { Text } from "@/components/Text";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { termsRows } from "@/lib/terms";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { useColors, inr } from "@/theme";

type Docs = {
  terms: Array<{ id: string; terms_version: number | null; accepted_at: string; snapshot_hash: string; snapshot: any; rooms: { room_number: string; rent_amount: number; myr_deposit: number | null } | null; properties: { name: string } | null }>;
  receipts: Array<{ id: string; amount: number; upi_ref: string | null; verified_at: string | null; created_at: string; bills: { rent_period_start: string; rent_period_end: string; rooms: { room_number: string; properties: { name: string } | null } | null } | null }>;
};
const d = (s: string) => new Date(s).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export default function Documents() {
  const c = useColors();
  const q = useQuery({ queryKey: ["docs"], queryFn: () => api<Docs>("docs") });
  const [open, setOpen] = React.useState<string | null>(null);
  const empty = q.data && !q.data.terms.length && !q.data.receipts.length;
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <ErrorText error={q.error} />
      {q.isLoading && <Empty text="Loading…" />}
      {empty && <Empty text="Abhi koi document nahi. Booking aur payment verify hone par yahan aayenge." />}
      {!!q.data?.terms.length && <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12 }}>ACCEPTED RENTAL TERMS</Text>}
      {q.data?.terms.map((t) => (
        <Card key={t.id} style={{ gap: 6 }}>
          <Text style={{ color: c.text, fontWeight: "700" }}>{t.properties?.name} · Room {t.rooms?.room_number}</Text>
          <Text style={{ color: c.muted }}>Version {t.terms_version ?? "—"} · accepted {d(t.accepted_at)}</Text>
          <Text style={{ color: c.muted, fontSize: 11 }}>Ref {t.snapshot_hash.slice(0, 12)}</Text>
          <Button kind="ghost" title={open === t.id ? "Chhupayein" : "Terms dekhein"} onPress={() => setOpen(open === t.id ? null : t.id)} />
          {open === t.id && termsRows(t.snapshot?.terms ?? t.snapshot, t.rooms?.rent_amount ?? 0, t.rooms?.myr_deposit ?? null).map(([k, v]) => (
            <View key={k} style={{ flexDirection: "row", gap: 10, paddingVertical: 3 }}>
              <Text style={{ color: c.muted, width: 120 }}>{k}</Text><Text style={{ color: c.text, flex: 1, fontWeight: "600" }}>{v}</Text>
            </View>
          ))}
        </Card>
      ))}
      {!!q.data?.receipts.length && <Text style={{ color: c.muted, fontWeight: "700", fontSize: 12, marginTop: 8 }}>PAYMENT RECEIPTS</Text>}
      {q.data?.receipts.map((r) => {
        const period = r.bills ? `${d(r.bills.rent_period_start)} – ${d(r.bills.rent_period_end)}` : "";
        const place = `${r.bills?.rooms?.properties?.name ?? ""} Room ${r.bills?.rooms?.room_number ?? ""}`.trim();
        return (
          <Card key={r.id} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontWeight: "800", fontSize: 17 }}>{inr(r.amount)}</Text>
              <Text style={{ color: c.primary, fontWeight: "700" }}>Verified ✔</Text>
            </View>
            <Text style={{ color: c.muted }}>{place}{period ? ` · ${period}` : ""}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>Paid {d(r.created_at)}{r.upi_ref ? ` · UTR ${r.upi_ref}` : ""}</Text>
            <Button kind="ghost" title="Receipt share karein" style={{ marginTop: 6 }}
              onPress={() => Share.share({ message: `Rentalos rent receipt\n${place}\nPeriod: ${period}\nAmount: ${inr(r.amount)}\nPaid on: ${d(r.created_at)}${r.upi_ref ? `\nUTR: ${r.upi_ref}` : ""}\nVerified by owner${r.verified_at ? ` on ${d(r.verified_at)}` : ""}` })} />
          </Card>
        );
      })}
    </ScrollView>
  );
}
