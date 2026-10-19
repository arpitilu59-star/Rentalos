import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, ErrorText } from "@/components/ui";
import { Field } from "@/lib/ui2";
import { useColors } from "@/theme";

export default function Profile() {
  const c = useColors();
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api<{ name: string | null; upi: string | null; phone: string | null; canVerifyPayments: boolean; canLivePhotos: boolean }>("l/me") });
  const [name, setName] = useState(""); const [upi, setUpi] = useState(""); const [phone, setPhone] = useState("");
  useEffect(() => { if (me.data) { setName(me.data.name ?? ""); setUpi(me.data.upi ?? ""); setPhone(me.data.phone ?? ""); } }, [me.data]);
  const save = useMutation({
    mutationFn: () => api("l/profile/save", { business_name: name, upi_id: upi, phone }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["me"] }); },
  });
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps="handled">
      <Field label="Naam / business ka naam" value={name} onChange={setName} />
      <Field label="UPI ID (rent yahin aayega)" value={upi} onChange={setUpi} placeholder="name@upi" required hint="Tenants isi UPI par rent bhejte hain." />
      <Field label="Phone" value={phone} onChange={setPhone} keyboard="phone-pad" />
      <ErrorText error={save.error} />
      {save.isSuccess ? <Text style={{ color: c.ok }}>Save ho gaya ✓</Text> : null}
      <Button title="Save karein" busy={save.isPending} onPress={() => save.mutate()} />
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>Aapka plan</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>Payment verification: {me.data?.canVerifyPayments ? "chalu ✓" : "plan upgrade par"}</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>Live photos: {me.data?.canLivePhotos ? "chalu ✓" : "plan upgrade par"}</Text>
      </Card>
      <Button kind="ghost" title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}
