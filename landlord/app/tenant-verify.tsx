import React, { useState } from "react";
import { Alert, ScrollView, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Text";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, Empty, ErrorText } from "@/components/ui";
import { Choice, Field, Pill } from "@/lib/ui2";
import { useColors, dmy } from "@/theme";

type Item = {
  id: string;
  kind: string;
  status: string;
  rejection_reason: string | null;
  created_at: string;
  tenants: { name: string } | null;
  properties: { name: string } | null;
  verification_documents: Array<{ doc_type: string }>;
};
const TENANT_DOCS: Array<[string, string]> = [
  ["aadhaar", "Aadhaar"],
  ["pan", "PAN"],
  ["dl", "Driving licence"],
  ["profile_photo", "Photo"],
];
const PROP_DOCS: Array<[string, string]> = [
  ["ownership", "Ownership paper"],
  ["property_photo", "Property photo"],
];
const tone = (s: string): "ok" | "warn" | "danger" | "muted" =>
  s === "verified" ? "ok" : s === "rejected" ? "danger" : s === "pending" ? "warn" : "muted";

/** Landlord submits a tenant's or a property's documents for review. Only Rentalos admins can approve. */
export default function TenantVerify() {
  const c = useColors();
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["own-verifications"],
    queryFn: () => api<{ items: Item[] }>("l/verifications"),
  });
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () =>
      api<{ tenants: Array<{ id: string; name: string; active: boolean }> }>("l/tenants"),
  });
  const props = useQuery({
    queryKey: ["props"],
    queryFn: () => api<{ properties: Array<{ id: string; name: string }> }>("l/properties"),
  });
  const [kind, setKind] = useState<"tenant" | "property">("tenant");
  const [target, setTarget] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [docs, setDocs] = useState<Array<{ doc_type: string; storage_path: string }>>([]);
  const [type, setType] = useState<string | null>(null);

  const addDoc = useMutation({
    mutationFn: async () => {
      if (!type) throw new Error("Pehle document ka type chunein.");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Gallery permission chahiye.");
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.7,
        base64: true,
      });
      if (r.canceled || !r.assets[0]?.base64) return;
      const a = r.assets[0];
      const bin = Uint8Array.from(atob(a.base64 as string), (ch) => ch.charCodeAt(0));
      if (bin.length > 5 * 1024 * 1024) throw new Error("Photo 5 MB se badi hai.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const mime = a.mimeType ?? "image/jpeg";
      const ext = mime === "image/png" ? "png" : "jpg";
      const path = `${u.user.id}/${Date.now()}-${type}.${ext}`;
      const { error } = await supabase.storage
        .from("verification-docs")
        .upload(path, bin, { contentType: mime });
      if (error) throw new Error("Upload nahi hua. Internet check karke dobara try karein.");
      setDocs((d) => [...d, { doc_type: type, storage_path: path }]);
    },
  });
  const submit = useMutation({
    mutationFn: () =>
      api("l/verification/create", {
        kind,
        tenant_id: kind === "tenant" ? target : undefined,
        property_id: kind === "property" ? target : undefined,
        notes,
        documents: docs,
      }),
    onSuccess: () => {
      setDocs([]);
      setNotes("");
      setTarget(null);
      qc.invalidateQueries({ queryKey: ["own-verifications"] });
      Alert.alert("Bhej diya", "Rentalos team review karegi.");
    },
  });
  const targets: Array<[string, string]> =
    kind === "tenant"
      ? (tenants.data?.tenants ?? []).filter((t) => t.active).map((t) => [t.id, t.name])
      : (props.data?.properties ?? []).map((p) => [p.id, p.name]);
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 12 }}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Tenant ya property ke documents review ke liye bhejein. Approve sirf Rentalos admin karta
          hai.
        </Text>
      </Card>
      <Choice
        label="Kis ki verification"
        value={kind}
        options={[
          ["tenant", "Tenant"],
          ["property", "Property"],
        ]}
        onChange={(k) => {
          setKind(k);
          setTarget(null);
          setDocs([]);
          setType(null);
        }}
      />
      <Choice
        label={kind === "tenant" ? "Tenant" : "Property"}
        required
        value={target}
        options={targets}
        onChange={setTarget}
      />
      <Choice
        label="Document type"
        value={type}
        options={kind === "tenant" ? TENANT_DOCS : PROP_DOCS}
        onChange={setType}
      />
      <Button
        kind="ghost"
        title="📎 Photo chunein aur jodein"
        busy={addDoc.isPending}
        disabled={!type}
        onPress={() => addDoc.mutate()}
      />
      {docs.map((d, i) => (
        <Text key={i} style={{ color: c.text, fontSize: 13 }}>
          ✓ {d.doc_type}
        </Text>
      ))}
      <Field
        label="Notes (optional)"
        value={notes}
        onChange={setNotes}
        multiline
        maxLength={2000}
      />
      <ErrorText error={addDoc.error ?? submit.error} />
      <Button
        title="Review ke liye bhejein"
        busy={submit.isPending}
        disabled={!target || !docs.length}
        onPress={() => submit.mutate()}
      />
      <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
        Pichli requests
      </Text>
      {list.data && !list.data.items.length ? <Empty text="Abhi koi request nahi." /> : null}
      {list.data?.items.map((v) => (
        <Card key={v.id} style={{ gap: 3 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
            <Text style={{ color: c.text, fontWeight: "700", flex: 1 }}>
              {v.tenants?.name ?? v.properties?.name ?? v.kind}
            </Text>
            <Pill text={v.status} tone={tone(v.status)} />
          </View>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {dmy(v.created_at)} · {v.verification_documents.length} doc
          </Text>
          {v.rejection_reason ? (
            <Text style={{ color: c.danger, fontSize: 12 }}>Wajah: {v.rejection_reason}</Text>
          ) : null}
        </Card>
      ))}
    </ScrollView>
  );
}
