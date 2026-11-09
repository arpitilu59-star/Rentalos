import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { Button, Card, ErrorText } from "@/components/ui";
import { Field } from "@/lib/ui2";
import { useColors } from "@/theme";
import { useRouter } from "expo-router";

export default function Profile() {
  const c = useColors();
  const qc = useQueryClient();
  const router = useRouter();
  const wa = useQuery({
    queryKey: ["wa-status"],
    queryFn: () =>
      api<{
        linked: boolean;
        opted_in: boolean;
        phone_masked: string | null;
        live_delivery: boolean;
      }>("l/whatsapp"),
  });
  const me = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{
        name: string | null;
        full_name: string | null;
        business_name: string | null;
        address: string | null;
        city: string | null;
        bank_details: string | null;
        upi: string | null;
        phone: string | null;
        canVerifyPayments: boolean;
        canLivePhotos: boolean;
      }>("l/me"),
  });
  const [fullName, setFullName] = useState("");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [bank, setBank] = useState("");
  const [upi, setUpi] = useState("");
  const [phone, setPhone] = useState("");
  useEffect(() => {
    if (me.data) {
      setFullName(me.data.full_name ?? "");
      setName(me.data.business_name ?? "");
      setAddress(me.data.address ?? "");
      setCity(me.data.city ?? "");
      setBank(me.data.bank_details ?? "");
      setUpi(me.data.upi ?? "");
      setPhone(me.data.phone ?? "");
    }
  }, [me.data]);
  const save = useMutation({
    mutationFn: () =>
      api("l/profile/save", {
        full_name: fullName,
        business_name: name,
        upi_id: upi,
        phone,
        address,
        city,
        bank_details: bank,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  const bd = useQuery({
    queryKey: ["billing-defaults"],
    queryFn: () =>
      api<{ electricity_per_unit: number; water_per_person: number; cleaning_amount: number }>(
        "l/settings",
      ),
  });
  const [elec, setElec] = useState("");
  const [water, setWater] = useState("");
  const [clean, setClean] = useState("");
  useEffect(() => {
    if (bd.data) {
      setElec(String(bd.data.electricity_per_unit));
      setWater(String(bd.data.water_per_person));
      setClean(String(bd.data.cleaning_amount));
    }
  }, [bd.data]);
  const saveBd = useMutation({
    mutationFn: () =>
      api("l/settings/save", {
        electricity_per_unit: elec,
        water_per_person: water,
        cleaning_amount: clean,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["billing-defaults"] }),
  });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={{ color: c.muted, fontSize: 12 }}>
        Ye details tenants ko bheje gaye bill PDF aur WhatsApp message mein dikhti hain.
      </Text>
      <Field label="Aapka poora naam" value={fullName} onChange={setFullName} />
      <Field
        label="Business / PG ka naam (optional)"
        value={name}
        onChange={setName}
        hint="Bill ke upar yehi naam aata hai; khali ho to aapka naam."
      />
      <Field
        label="UPI ID (rent yahin aayega)"
        value={upi}
        onChange={setUpi}
        placeholder="name@upi"
        required
        hint="Tenants isi UPI par rent bhejte hain."
      />
      <Field label="Phone" value={phone} onChange={setPhone} keyboard="phone-pad" />
      <Field label="Address" value={address} onChange={setAddress} multiline maxLength={300} />
      <Field label="City" value={city} onChange={setCity} />
      <Field
        label="Bank details (optional)"
        value={bank}
        onChange={setBank}
        multiline
        maxLength={400}
        hint="Account naam, number aur IFSC — UPI na ho to tenant bank transfer kar sakta hai."
      />
      <ErrorText error={save.error} />
      {save.isSuccess ? <Text style={{ color: c.ok }}>Save ho gaya ✓</Text> : null}
      <Button title="Save karein" busy={save.isPending} onPress={() => save.mutate()} />
      <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 8 }}>
        Bill ke default rates
      </Text>
      <Field label="Bijli rate (₹ / unit)" value={elec} onChange={setElec} keyboard="numeric" />
      <Field
        label="Paani (₹ / person / mahina)"
        value={water}
        onChange={setWater}
        keyboard="numeric"
      />
      <Field
        label="Safai (₹ / room / mahina)"
        value={clean}
        onChange={setClean}
        keyboard="numeric"
        hint="Naye bill mein ye apne aap bhar jaate hain; room ke hisaab se badal sakte hain."
      />
      <ErrorText error={saveBd.error} />
      {saveBd.isSuccess ? <Text style={{ color: c.ok }}>Rates save ho gaye ✓</Text> : null}
      <Button
        kind="ghost"
        title="Rates save karein"
        busy={saveBd.isPending}
        onPress={() => saveBd.mutate()}
      />
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>Aapka plan</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Payment verification: {me.data?.canVerifyPayments ? "chalu ✓" : "plan upgrade par"}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          Live photos: {me.data?.canLivePhotos ? "chalu ✓" : "plan upgrade par"}
        </Text>
      </Card>
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: "700" }}>WhatsApp</Text>
        {wa.data ? (
          <>
            <Text style={{ color: c.muted, fontSize: 13 }}>
              {wa.data.linked ? `Linked ✓ ${wa.data.phone_masked ?? ""}` : "Abhi linked nahi hai"}
              {wa.data.linked ? (wa.data.opted_in ? " · opted in" : " · opt-in off") : ""}
            </Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {wa.data.live_delivery
                ? "Automatic messages live hain."
                : "Automatic delivery abhi band hai (server par WhatsApp configured nahi). Bill se manual WhatsApp bhej sakte hain."}
            </Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>
              Number link/verify karna website ke Settings se hota hai.
            </Text>
          </>
        ) : (
          <Text style={{ color: c.muted, fontSize: 13 }}>Load ho raha hai…</Text>
        )}
      </Card>
      <Button
        kind="ghost"
        title="Partner CSV import"
        onPress={() => router.push("/partner-import" as never)}
      />
      <Button
        kind="ghost"
        title="Plan & features"
        onPress={() => router.push("/subscription" as never)}
      />
      <Button
        kind="ghost"
        title="Verification status"
        onPress={() => router.push("/verification" as never)}
      />
      <Button
        kind="ghost"
        title="Help & feedback"
        onPress={() => router.push("/feedback" as never)}
      />
      <Button kind="ghost" title="Sign out" onPress={() => supabase.auth.signOut()} />
    </ScrollView>
  );
}
