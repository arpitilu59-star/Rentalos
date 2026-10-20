import React from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, WEB } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Pill, Row } from "@/lib/ui2";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, inr, dmy } from "@/theme";

type Sub = {
  entitlements: {
    plan_code: string;
    status: string;
    expires_at: string | null;
    features: Record<string, boolean>;
    limits: Record<string, number | null>;
  };
  plans: Array<{
    id: string;
    code: string;
    name: string;
    description: string | null;
    price_inr: number;
    billing_months: number;
  }>;
  features: Array<{ feature_key: string; label: string; description: string | null; kind: string }>;
  planEntitlements: Array<{
    plan_id: string;
    feature_key: string;
    enabled: boolean;
    limit_value: number | null;
  }>;
  payments: Array<{
    id: string;
    status: string;
    amount: number;
    submitted_at: string;
    admin_note: string | null;
  }>;
};
const STATUS: Record<string, [string, "ok" | "warn" | "danger" | "muted"]> = {
  ACTIVE: ["Active", "ok"],
  FREE: ["Free", "muted"],
  PENDING: ["Verification baaki", "warn"],
  EXPIRED: ["Expired", "danger"],
  SUSPENDED: ["Suspended", "danger"],
  CANCELLED: ["Cancelled", "muted"],
};

/** Read-only: plan, real entitlements and prices come from the database. Upgrades are paid + verified on the website. */
export default function Subscription() {
  const c = useColors();
  const q = useQuery({ queryKey: ["subscription"], queryFn: () => api<Sub>("l/subscription") });
  const d = q.data;
  const [txt, tone] = d
    ? (STATUS[d.entitlements.status] ?? [d.entitlements.status, "muted" as const])
    : ["", "muted" as const];
  const mine = d?.plans.find((p) => p.code === d.entitlements.plan_code);
  const feats = d?.features.filter((f) => f.kind === "feature") ?? [];
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <ErrorText error={q.error} />
      {!d ? (
        <SkeletonList n={2} height={120} />
      ) : (
        <>
          <Card style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: c.text, fontSize: 20, fontWeight: "800" }}>
                {mine?.name ?? d.entitlements.plan_code}
              </Text>
              <Pill text={txt} tone={tone} />
            </View>
            {d.entitlements.expires_at ? (
              <Row k="Valid till" v={dmy(d.entitlements.expires_at)} />
            ) : null}
            {Object.entries(d.entitlements.limits).map(([k, v]) => (
              <Row
                key={k}
                k={k === "max_properties" ? "Max properties" : k === "max_rooms" ? "Max rooms" : k}
                v={v == null ? "Unlimited" : String(v)}
              />
            ))}
          </Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Aapke features</Text>
          <Card style={{ gap: 8 }}>
            {feats.map((f) => {
              const on = d.entitlements.features[f.feature_key] === true;
              return (
                <View
                  key={f.feature_key}
                  style={{ flexDirection: "row", gap: 10, alignItems: "center" }}
                >
                  <Ionicons
                    name={on ? "checkmark-circle" : "lock-closed-outline"}
                    size={20}
                    color={on ? c.ok : c.muted}
                  />
                  <Text style={{ color: on ? c.text : c.muted, flex: 1 }}>{f.label}</Text>
                </View>
              );
            })}
          </Card>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Plans</Text>
          {d.plans.map((p) => (
            <Card
              key={p.id}
              style={{
                gap: 3,
                borderColor: p.code === d.entitlements.plan_code ? c.primary : c.border,
              }}
            >
              <Text style={{ color: c.text, fontWeight: "800" }}>
                {p.name}
                {p.code === d.entitlements.plan_code ? " (aapka plan)" : ""}
              </Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>
                {p.price_inr > 0 ? `${inr(p.price_inr)} / ${p.billing_months} mahine` : "Free"}
                {p.description ? ` · ${p.description}` : ""}
              </Text>
            </Card>
          ))}
          {d.payments.length ? (
            <>
              <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>
                Payment history
              </Text>
              {d.payments.map((p) => (
                <Card key={p.id} style={{ gap: 2 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Text style={{ color: c.text, fontWeight: "700" }}>{inr(p.amount)}</Text>
                    <Pill
                      text={p.status.replace(/_/g, " ")}
                      tone={
                        p.status === "APPROVED" ? "ok" : p.status === "REJECTED" ? "danger" : "warn"
                      }
                    />
                  </View>
                  <Text style={{ color: c.muted, fontSize: 12 }}>
                    {dmy(p.submitted_at)}
                    {p.admin_note ? ` · ${p.admin_note}` : ""}
                  </Text>
                </Card>
              ))}
            </>
          ) : null}
          <Card>
            <Text style={{ color: c.muted, fontSize: 13 }}>
              Plan upgrade ka payment website par hota hai aur admin verify karta hai. Features
              tabhi chalu hote hain jab admin approve kare — app se plan badla nahi ja sakta.
            </Text>
          </Card>
          <Button
            title="Website par plan dekhein / upgrade"
            onPress={() => Linking.openURL(`${WEB}/subscription`)}
          />
        </>
      )}
    </ScrollView>
  );
}
