import React, { useState } from "react";
import { ScrollView } from "react-native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Field } from "@/lib/ui2";
import { useColors } from "@/theme";

const TEMPLATE = `property_external_ref_id,property_name,city,address,room_external_ref_id,room_number,rent_amount,description,amenities
BLOCK-A,Sunrise Block A,Jaipur,"123 MG Road",A-101,101,8500,"2BHK","wifi;parking"`;

type Res = {
  dry_run?: boolean;
  valid_rows?: number;
  propertiesUpserted?: number;
  roomsUpserted?: number;
  errors: string[];
};

export default function PartnerImport() {
  const c = useColors();
  const [csv, setCsv] = useState("");
  const st = useQuery({
    queryKey: ["partner"],
    queryFn: () =>
      api<{ org: { name: string; verified: boolean } | null; allowed: boolean }>("l/partner"),
  });
  const run = useMutation({
    mutationFn: (dry: boolean) => api<Res>("l/partner/import", { csv, dry_run: dry }),
  });
  if (st.data && !st.data.org)
    return (
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: c.muted }}>
          Aapka account kisi partner organization se linked nahi hai. Ye feature sirf partners ke
          liye hai.
        </Text>
      </ScrollView>
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      {st.data?.org ? (
        <Text style={{ color: c.text, fontWeight: "800" }}>
          {st.data.org.name} {st.data.org.verified ? "✓" : "(verification baaki)"}
        </Text>
      ) : null}
      {st.data && !st.data.allowed ? (
        <Text style={{ color: c.danger }}>Aapke plan mein partner import chalu nahi hai.</Text>
      ) : null}
      <Field
        label="CSV yahan paste karein"
        value={csv}
        onChange={setCsv}
        multiline
        placeholder={TEMPLATE}
      />
      <Button
        kind="ghost"
        title="Pehle check karein"
        busy={run.isPending}
        disabled={!csv.trim()}
        onPress={() => run.mutate(true)}
      />
      <Button
        title="Import karein"
        busy={run.isPending}
        disabled={!csv.trim() || !st.data?.allowed}
        onPress={() => run.mutate(false)}
      />
      <ErrorText error={run.error} />
      {run.data ? (
        <Card style={{ gap: 4 }}>
          {run.data.dry_run ? (
            <Text style={{ color: c.text }}>
              {run.data.valid_rows} rows sahi hain (abhi import nahi hua).
            </Text>
          ) : (
            <Text style={{ color: c.text }}>
              {run.data.propertiesUpserted} properties, {run.data.roomsUpserted} rooms import hue.
            </Text>
          )}
          {run.data.errors.slice(0, 15).map((e) => (
            <Text key={e} style={{ color: c.danger, fontSize: 12 }}>
              {e}
            </Text>
          ))}
        </Card>
      ) : null}
      <Text style={{ color: c.muted, fontSize: 12 }}>Columns: {TEMPLATE.split("\n")[0]}</Text>
    </ScrollView>
  );
}
