import React, { useState } from "react";
import { ScrollView } from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Choice, Field } from "@/lib/ui2";

type T = { id: string; name: string; active: boolean; rooms: { room_number: string } | null };

export default function DepositForm() {
  const router = useRouter();
  const qc = useQueryClient();
  const tenants = useQuery({
    queryKey: ["tenants"],
    queryFn: () => api<{ tenants: T[] }>("l/tenants"),
  });
  const [tid, setTid] = useState<string | null>(null);
  const [amt, setAmt] = useState("");
  const save = useMutation({
    mutationFn: () => api("l/deposit/create", { tenant_id: tid, amount_held: amt }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deposits"] });
      router.back();
    },
  });
  const opts = (tenants.data?.tenants ?? [])
    .filter((t) => t.active)
    .map((t) => [t.id, `${t.name} · ${t.rooms?.room_number ?? ""}`] as [string, string]);
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Choice label="Tenant" required value={tid} options={opts} onChange={setTid} />
      <Field label="Deposit amount (₹)" required value={amt} onChange={setAmt} keyboard="numeric" />
      <ErrorText error={save.error} />
      <Button
        title="Deposit record karein"
        busy={save.isPending}
        disabled={!tid || amt === ""}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}
