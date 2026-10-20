import React, { useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, Card, ErrorText } from "@/components/ui";
import { Choice, Field, useUnsavedGuard } from "@/lib/ui2";
import { useColors } from "@/theme";

/* eslint-disable @typescript-eslint/no-explicit-any */
const NS = "not_specified";
const TRI: Array<[string, string]> = [
  ["yes", "Haan"],
  ["no", "Nahi"],
];
const POLICY: Array<[string, string]> = [
  ["allowed", "Allowed"],
  ["limited", "Limited"],
  ["not_allowed", "Not allowed"],
];
const AN: Array<[string, string]> = [
  ["allowed", "Allowed"],
  ["not_allowed", "Not allowed"],
];
const nOrNull = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));
const lines = (s: string) =>
  s
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);

export default function Terms() {
  const c = useColors();
  const router = useRouter();
  const guard = useUnsavedGuard();
  const qc = useQueryClient();
  const { propertyId } = useLocalSearchParams<{ propertyId: string }>();
  const q = useQuery({
    queryKey: ["terms", propertyId],
    queryFn: () =>
      api<{ name: string; terms: any; version: number | null; completeness: number }>("l/terms", {
        property_id: propertyId,
      }),
  });
  const [t, setT] = useState<any>(null);
  const [landlordR, setLR] = useState("");
  const [tenantR, setTR] = useState("");
  const [num, setNum] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  useEffect(() => {
    if (!q.data) return;
    const x = q.data.terms;
    setT(x);
    setLR((x.landlord_responsibilities ?? []).join("\n"));
    setTR((x.tenant_responsibilities ?? []).join("\n"));
    setNum({
      rate: x.electricity_rate != null ? String(x.electricity_rate) : "",
      maint: x.maintenance_charge != null ? String(x.maintenance_charge) : "",
      notice: x.notice_period_days != null ? String(x.notice_period_days) : "",
      lock: x.lock_in_months != null ? String(x.lock_in_months) : "",
      refund: x.deposit_refund_days != null ? String(x.deposit_refund_days) : "",
      escP: x.rent_escalation?.percent != null ? String(x.rent_escalation.percent) : "",
      escM: x.rent_escalation?.every_months != null ? String(x.rent_escalation.every_months) : "",
      curfew: x.curfew?.time ?? "",
    });
  }, [q.dataUpdatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: string, v: any) => {
    guard.mark();
    setT((x: any) => ({ ...x, [k]: v }));
  };
  const n = (k: string, v: string) => {
    guard.mark();
    setNum((x) => ({ ...x, [k]: v }));
  };

  const build = () => ({
    ...t,
    electricity_rate: nOrNull(num.rate ?? ""),
    maintenance_charge: nOrNull(num.maint ?? ""),
    notice_period_days: nOrNull(num.notice ?? ""),
    lock_in_months: nOrNull(num.lock ?? ""),
    deposit_refund_days: nOrNull(num.refund ?? ""),
    rent_escalation: { percent: nOrNull(num.escP ?? ""), every_months: nOrNull(num.escM ?? "") },
    curfew: {
      enabled: t.curfew.enabled,
      time:
        t.curfew.enabled === "yes" && /^([01]\d|2[0-3]):[0-5]\d$/.test(num.curfew ?? "")
          ? num.curfew
          : null,
    },
    landlord_responsibilities: lines(landlordR),
    tenant_responsibilities: lines(tenantR),
  });
  const save = useMutation({
    mutationFn: () =>
      api("l/terms/publish", { property_id: propertyId, terms: build(), note: note || undefined }),
    onSuccess: () => {
      guard.clear();
      qc.invalidateQueries({ queryKey: ["terms", propertyId] });
      qc.invalidateQueries({ queryKey: ["props"] });
      qc.invalidateQueries({ queryKey: ["listing"] });
      router.back();
    },
  });
  if (!t) return <Text style={{ color: c.muted, padding: 20 }}>Loading…</Text>;
  const H = ({ children }: { children: string }) => (
    <Text style={{ color: c.text, fontSize: 16, fontWeight: "800", marginTop: 6 }}>{children}</Text>
  );

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Card style={{ gap: 4 }}>
        <Text style={{ color: c.text, fontWeight: "800" }}>{q.data?.name} — rental terms</Text>
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Tenant booking se pehle ye terms padhkar tick karta hai.{" "}
          <Text style={{ color: c.danger }}>*</Text> wali cheezein bharna zaroori hai. Save karne
          par naya version banta hai; purane tenants ke accept kiye terms nahi badalte, unhe naya
          version dobara accept karna padta hai.
        </Text>
        {q.data?.version ? (
          <Text style={{ color: c.muted, fontSize: 12 }}>
            Abhi version {q.data.version} · {q.data.completeness}% complete
          </Text>
        ) : null}
      </Card>

      <H>Kaun rah sakta hai</H>
      <Choice
        label="Kis ke liye"
        required
        value={t.gender === NS ? null : t.gender}
        options={[
          ["male", "Boys / Male"],
          ["female", "Girls / Female"],
          ["any", "Anyone"],
        ]}
        onChange={(v) => set("gender", v)}
      />

      <H>Khana</H>
      <Choice
        label="Khana rent mein included hai?"
        value={t.food.included === NS ? null : t.food.included}
        options={TRI}
        onChange={(v) => set("food", { ...t.food, included: v })}
      />
      {t.food.included === "yes" ? (
        <>
          <Choice
            label="Kitne meals"
            value={t.food.meals === NS ? null : t.food.meals}
            options={[
              ["breakfast", "Breakfast"],
              ["two_meals", "2 meals"],
              ["three_meals", "3 meals"],
            ]}
            onChange={(v) => set("food", { ...t.food, meals: v })}
          />
          <Choice
            label="Khane ka type"
            value={t.food.type === NS ? null : t.food.type}
            options={[
              ["veg", "Veg"],
              ["non_veg", "Non-veg"],
              ["both", "Dono"],
            ]}
            onChange={(v) => set("food", { ...t.food, type: v })}
          />
        </>
      ) : null}

      <H>House rules</H>
      <Choice
        label="Visitors"
        required
        value={t.visitors === NS ? null : t.visitors}
        options={POLICY}
        onChange={(v) => set("visitors", v)}
      />
      <Choice
        label="Smoking"
        required
        value={t.smoking === NS ? null : t.smoking}
        options={AN}
        onChange={(v) => set("smoking", v)}
      />
      <Choice
        label="Alcohol"
        value={t.alcohol === NS ? null : t.alcohol}
        options={AN}
        onChange={(v) => set("alcohol", v)}
      />
      <Choice
        label="Pets"
        required
        value={t.pets === NS ? null : t.pets}
        options={AN}
        onChange={(v) => set("pets", v)}
      />
      <Choice
        label="Curfew (gate band hone ka time)"
        value={t.curfew.enabled === NS ? null : t.curfew.enabled}
        options={TRI}
        onChange={(v) => set("curfew", { ...t.curfew, enabled: v })}
      />
      {t.curfew.enabled === "yes" ? (
        <Field
          label="Curfew time (24 ghante, jaise 22:30)"
          value={num.curfew ?? ""}
          onChange={(v) => n("curfew", v)}
          placeholder="22:30"
        />
      ) : null}

      <H>Suvidhayein</H>
      {(
        [
          ["cooking", "Cooking allowed"],
          ["ac", "AC"],
          ["wifi", "WiFi"],
          ["laundry", "Laundry"],
          ["parking_two_wheeler", "Bike parking"],
          ["parking_four_wheeler", "Car parking"],
        ] as const
      ).map(([k, l]) => (
        <Choice
          key={k}
          label={l}
          value={t[k] === NS ? null : t[k]}
          options={TRI}
          onChange={(v) => set(k, v)}
        />
      ))}

      <H>Paisa aur charges</H>
      <Choice
        label="Bijli ka bill"
        required
        value={t.electricity === NS ? null : t.electricity}
        options={[
          ["included", "Rent mein included"],
          ["metered", "Meter se (per unit)"],
          ["fixed", "Fixed / mahina"],
        ]}
        onChange={(v) => set("electricity", v)}
      />
      {t.electricity === "metered" || t.electricity === "fixed" ? (
        <Field
          label={t.electricity === "metered" ? "Bijli rate (₹ / unit)" : "Bijli (₹ / mahina)"}
          value={num.rate ?? ""}
          onChange={(v) => n("rate", v)}
          keyboard="numeric"
        />
      ) : null}
      <Field
        label="Maintenance charge (₹ / mahina)"
        value={num.maint ?? ""}
        onChange={(v) => n("maint", v)}
        keyboard="numeric"
        hint="Nahi hai to khali chhodein."
      />
      <Field
        label="Rent badhne ka % (optional)"
        value={num.escP ?? ""}
        onChange={(v) => n("escP", v)}
        keyboard="numeric"
      />
      <Field
        label="Kitne mahine mein badhega (optional)"
        value={num.escM ?? ""}
        onChange={(v) => n("escM", v)}
        keyboard="numeric"
      />

      <H>Notice, lock-in, deposit</H>
      <Field
        label="Notice period (din)"
        required
        value={num.notice ?? ""}
        onChange={(v) => n("notice", v)}
        keyboard="numeric"
        hint="Room chhodne se kitne din pehle batana hoga. Nahi hai to 0."
      />
      <Field
        label="Lock-in (mahine)"
        required
        value={num.lock ?? ""}
        onChange={(v) => n("lock", v)}
        keyboard="numeric"
        hint="Nahi hai to 0."
      />
      <Field
        label="Deposit kitne din mein wapas (move-out ke baad)"
        required
        value={num.refund ?? ""}
        onChange={(v) => n("refund", v)}
        keyboard="numeric"
      />

      <H>Documents</H>
      <Choice
        label="Rent agreement"
        value={t.agreement === NS ? null : t.agreement}
        options={[
          ["required", "Zaroori"],
          ["not_required", "Zaroori nahi"],
        ]}
        onChange={(v) => set("agreement", v)}
      />
      <Choice
        label="ID proof"
        value={t.id_proof_required === NS ? null : t.id_proof_required}
        options={TRI}
        onChange={(v) => set("id_proof_required", v)}
      />
      <Choice
        label="Police verification"
        value={t.police_verification === NS ? null : t.police_verification}
        options={TRI}
        onChange={(v) => set("police_verification", v)}
      />

      <H>Zimmedari</H>
      <Field
        label="Landlord ki zimmedari (har line mein ek)"
        required
        value={landlordR}
        onChange={guard.wrap(setLR)}
        multiline
        placeholder={"Paani ki supply\nWiFi chalu rakhna\nBade repairs"}
      />
      <Field
        label="Tenant ki zimmedari (har line mein ek)"
        required
        value={tenantR}
        onChange={guard.wrap(setTR)}
        multiline
        placeholder={"Room saaf rakhna\nTime par rent dena\nChhote nuksaan ki bharpai"}
      />
      <Field
        label="Extra rules (optional)"
        value={t.extra_rules ?? ""}
        onChange={(v) => set("extra_rules", v)}
        multiline
        maxLength={1000}
      />
      <Field
        label="Is badlav ka note (optional)"
        value={note}
        onChange={guard.wrap(setNote)}
        maxLength={300}
      />

      <ErrorText error={save.error} />
      <Button title="Terms publish karein" busy={save.isPending} onPress={() => save.mutate()} />
      <View style={{ height: 24 }} />
    </ScrollView>
  );
}
