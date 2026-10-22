import React from "react";
import { ScrollView } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Card, Empty, ErrorText } from "@/components/ui";
import { SkeletonList } from "@/components/Skeleton";
import { Pill, Row } from "@/lib/ui2";
import { useColors, dmy } from "@/theme";

type H = {
  property: { name: string; current_terms_version: number | null };
  versions: Array<{
    version: number;
    completeness: number;
    change_note: string | null;
    created_at: string;
    acceptances: number;
  }>;
};

export default function TermsHistory() {
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const c = useColors();
  const q = useQuery({
    queryKey: ["terms-history", propertyId],
    queryFn: () => api<H>("l/terms/history", { property_id: propertyId }),
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <ErrorText error={q.error} />
      {q.isLoading ? <SkeletonList n={3} height={90} /> : null}
      {q.data ? (
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 17 }}>
          {q.data.property.name}
        </Text>
      ) : null}
      {q.data && !q.data.versions.length ? (
        <Empty text="Abhi tak koi terms publish nahi hue." />
      ) : null}
      {q.data?.versions.map((v) => (
        <Card key={v.version} style={{ gap: 4 }}>
          <Text style={{ color: c.text, fontWeight: "800" }}>
            Version {v.version}{" "}
            {v.version === q.data?.property.current_terms_version ? (
              <Pill text="Current" tone="ok" />
            ) : null}
          </Text>
          <Row k="Published" v={dmy(v.created_at)} />
          <Row k="Completeness" v={`${v.completeness}%`} />
          <Row k="Tenants ne accept kiya" v={String(v.acceptances)} />
          {v.change_note ? (
            <Text style={{ color: c.muted, fontSize: 12 }}>Note: {v.change_note}</Text>
          ) : null}
        </Card>
      ))}
      <Text style={{ color: c.muted, fontSize: 12 }}>
        Purane versions badle nahi ja sakte — har badlav ek naya version banata hai.
      </Text>
    </ScrollView>
  );
}
