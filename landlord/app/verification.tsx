import React from "react";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useQuery } from "@tanstack/react-query";
import { api, WEB } from "@/lib/api";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Pill } from "@/lib/ui2";
import { SkeletonList } from "@/components/Skeleton";
import { useColors, dmy } from "@/theme";

type V = {
  properties: Array<{
    id: string;
    name: string;
    verification_status: string;
    verified_at: string | null;
  }>;
  requests: Array<{
    id: string;
    kind: string;
    status: string;
    rejection_reason: string | null;
    created_at: string;
  }>;
};
const tone = (s: string): "ok" | "warn" | "danger" | "muted" =>
  s === "verified" || s === "approved"
    ? "ok"
    : s === "rejected"
      ? "danger"
      : s === "pending" || s === "submitted"
        ? "warn"
        : "muted";

/** Read-only status. Only platform admins can approve — the app can never approve its own verification. */
export default function Verification() {
  const c = useColors();
  const q = useQuery({ queryKey: ["verification"], queryFn: () => api<V>("l/verification") });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} />}
    >
      <ErrorText error={q.error} />
      {!q.data ? (
        <SkeletonList n={2} height={80} />
      ) : (
        <>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800" }}>Properties</Text>
          {!q.data.properties.length ? <Empty text="Koi property nahi." /> : null}
          {q.data.properties.map((p) => (
            <Card key={p.id} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{p.name}</Text>
                <Pill
                  text={
                    p.verification_status === "verified"
                      ? "Verified ✓"
                      : p.verification_status === "rejected"
                        ? "Rejected"
                        : p.verification_status === "pending"
                          ? "Review mein"
                          : "Verify nahi hui"
                  }
                  tone={tone(p.verification_status)}
                />
              </View>
              {p.verified_at ? (
                <Text style={{ color: c.muted, fontSize: 12 }}>Verified {dmy(p.verified_at)}</Text>
              ) : null}
            </Card>
          ))}
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
            Identity requests
          </Text>
          {!q.data.requests.length ? (
            <Empty text="Koi identity verification request nahi." />
          ) : null}
          {q.data.requests.map((r) => (
            <Card key={r.id} style={{ gap: 3 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={{ color: c.text, fontWeight: "700" }}>
                  {r.kind.replace(/_/g, " ")}
                </Text>
                <Pill text={r.status} tone={tone(r.status)} />
              </View>
              <Text style={{ color: c.muted, fontSize: 12 }}>{dmy(r.created_at)}</Text>
              {r.rejection_reason ? (
                <Text style={{ color: c.danger, fontSize: 13 }}>Wajah: {r.rejection_reason}</Text>
              ) : null}
            </Card>
          ))}
          <Card>
            <Text style={{ color: c.muted, fontSize: 13 }}>
              Documents upload aur verification request website par hoti hai; approval sirf Rentalos
              admin deta hai.
            </Text>
          </Card>
          <Button
            title="Website par verify karein"
            onPress={() => Linking.openURL(`${WEB}/verify-identity`)}
          />
        </>
      )}
    </ScrollView>
  );
}
