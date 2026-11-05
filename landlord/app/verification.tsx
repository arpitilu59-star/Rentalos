import React, { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import { supabase } from "@/lib/supabase";
import { Linking, RefreshControl, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
type Kyc = {
  records: Array<{
    id: string;
    kind: string;
    status: string;
    id_doc_path: string | null;
    selfie_path: string | null;
    property_doc_path: string | null;
    rejection_reason: string | null;
  }>;
};
const SLOTS: Array<{ field: string; kind: string; title: string; hint: string; camera?: boolean }> =
  [
    {
      field: "id_doc_path",
      kind: "landlord",
      title: "Identity proof",
      hint: "Aadhaar / PAN / driving licence ki saaf photo",
    },
    {
      field: "selfie_path",
      kind: "landlord",
      title: "ID ke saath selfie",
      hint: "ID haath mein pakad kar apni photo",
      camera: true,
    },
    {
      field: "property_doc_path",
      kind: "property",
      title: "Property proof",
      hint: "Ownership paper ya recent bijli bill ki photo",
    },
  ];

function Documents() {
  const c = useColors();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["kyc"], queryFn: () => api<Kyc>("l/kyc") });
  const [busy, setBusy] = useState<string | null>(null);
  const up = useMutation({
    mutationFn: async (s: (typeof SLOTS)[number]) => {
      const perm = s.camera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== "granted") throw new Error("Permission chahiye.");
      const opts = { quality: 0.7, base64: true, mediaTypes: ["images"] as ["images"] };
      const r = s.camera
        ? await ImagePicker.launchCameraAsync(opts)
        : await ImagePicker.launchImageLibraryAsync(opts);
      if (r.canceled || !r.assets[0]?.base64) return;
      const a = r.assets[0];
      const mime = a.mimeType ?? "image/jpeg";
      const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
      const bin = Uint8Array.from(atob(a.base64 as string), (ch) => ch.charCodeAt(0));
      if (bin.length > 5 * 1024 * 1024) throw new Error("Photo 5 MB se badi hai.");
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Please sign in again.");
      const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
      const path = `${u.user.id}/${s.kind}-${s.field}-${rand}.${ext}`;
      const { error } = await supabase.storage
        .from("myr-kyc")
        .upload(path, bin, { contentType: mime });
      if (error) throw new Error("Upload nahi hua. Internet check karke dobara try karein.");
      await api("l/kyc/submit", { field: s.field, path });
    },
    onMutate: (s) => setBusy(s.field),
    onSettled: () => {
      setBusy(null);
      qc.invalidateQueries({ queryKey: ["kyc"] });
      qc.invalidateQueries({ queryKey: ["verification"] });
    },
    onError: (e) => Alert.alert("Upload", (e as Error).message),
  });
  const rec = (kind: string) => q.data?.records.find((r) => r.kind === kind);
  return (
    <>
      <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 4 }}>
        Documents
      </Text>
      <Text style={{ color: c.muted, fontSize: 12 }}>
        Documents optional hain — listing inke bina bhi publish hoti hai. Approval sirf Rentalos
        admin deta hai.
      </Text>
      {SLOTS.map((s) => {
        const r = rec(s.kind);
        const has = !!(r as Record<string, unknown> | undefined)?.[s.field];
        return (
          <Card key={s.field} style={{ gap: 4 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
              <Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{s.title}</Text>
              <Pill
                text={
                  !has
                    ? "Upload nahi"
                    : r?.status === "verified"
                      ? "Approved"
                      : r?.status === "rejected"
                        ? "Rejected"
                        : "Review mein"
                }
                tone={!has ? "muted" : tone(r?.status ?? "")}
              />
            </View>
            <Text style={{ color: c.muted, fontSize: 12 }}>{s.hint}</Text>
            {has && r?.status === "rejected" && r.rejection_reason ? (
              <Text style={{ color: c.danger, fontSize: 12 }}>Wajah: {r.rejection_reason}</Text>
            ) : null}
            <Button
              kind="ghost"
              title={has ? "Dobara upload karein" : s.camera ? "📷 Selfie lein" : "Photo chunein"}
              busy={busy === s.field}
              onPress={() => up.mutate(s)}
              style={{ paddingVertical: 9 }}
            />
          </Card>
        );
      })}
      <Text style={{ color: c.muted, fontSize: 12 }}>
        PDF upload ke liye website use karein (JPG/PNG/WebP, max 5 MB yahan).
      </Text>
    </>
  );
}

export default function Verification() {
  const c = useColors();
  const router = useRouter();
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
          <Documents />
          <Button
            title="Tenant / property verification request"
            onPress={() => router.push("/tenant-verify" as never)}
          />
          <Button
            kind="ghost"
            title="PDF upload ke liye website kholein"
            onPress={() => Linking.openURL(`${WEB}/verify-identity`)}
          />
        </>
      )}
    </ScrollView>
  );
}
