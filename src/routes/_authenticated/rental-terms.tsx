import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { TermsView, CompletenessBadge } from "@/components/terms/TermsView";
import { getMyPropertyTerms, publishRentalTerms } from "@/lib/terms.functions";
import { TermsSchema, completeness, emptyTerms, label, NS, type Terms } from "@/lib/terms/schema";

export const Route = createFileRoute("/_authenticated/rental-terms")({
  component: RentalTermsPage,
});

const sel = "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm";
type Opt = readonly string[];
const TRI: Opt = [NS, "yes", "no"];
const ALLOW: Opt = [NS, "allowed", "not_allowed"];

function Pick({
  name,
  value,
  opts,
  onChange,
}: {
  name: string;
  value: string;
  opts: Opt;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{name}</span>
      <select className={sel} value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map((o) => (
          <option key={o} value={o}>
            {label(o)}
          </option>
        ))}
      </select>
    </label>
  );
}
function Num({
  name,
  value,
  onChange,
  suffix,
}: {
  name: string;
  value: number | null;
  onChange: (v: number | null) => void;
  suffix?: string;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">
        {name}
        {suffix ? ` (${suffix})` : ""}
      </span>
      <input
        className={sel}
        inputMode="decimal"
        placeholder="Not specified"
        value={value ?? ""}
        onChange={(e) => {
          const v = e.target.value.trim();
          onChange(v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : value);
        }}
      />
    </label>
  );
}
function Lines({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="text-xs text-muted-foreground">{name} (one per line, max 10)</span>
      <textarea
        className={sel}
        rows={4}
        value={value.join("\n")}
        onChange={(e) =>
          onChange(
            e.target.value
              .split("\n")
              .slice(0, 10)
              .map((x) => x.slice(0, 140)),
          )
        }
      />
    </label>
  );
}

function RentalTermsPage() {
  const qc = useQueryClient();
  const load = useServerFn(getMyPropertyTerms);
  const publish = useServerFn(publishRentalTerms);
  const props = useQuery({
    queryKey: ["my-properties-lite"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .order("created_at");
      if (error) throw new Error("Couldn't load your properties.");
      return data ?? [];
    },
  });
  const [pid, setPid] = useState("");
  const [t, setT] = useState<Terms>(emptyTerms());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["my-terms", pid],
    queryFn: () => load({ data: { propertyId: pid } }),
    enabled: !!pid,
    retry: false,
  });

  useEffect(() => {
    if (!pid && props.data?.length) setPid(props.data[0].id);
  }, [props.data, pid]);
  useEffect(() => {
    if (detail.data) setT(detail.data.terms);
  }, [detail.data]);

  const set = <K extends keyof Terms>(k: K, v: Terms[K]) => setT((x) => ({ ...x, [k]: v }));

  const save = async () => {
    setErr(null);
    const parsed = TermsSchema.safeParse(t);
    if (!parsed.success) return setErr("Some values are out of range. Check numbers and times.");
    setBusy(true);
    try {
      const r = await publish({
        data: { propertyId: pid, terms: parsed.data, note: note || undefined },
      });
      toast.success(
        `Published version ${r.version}. Existing booking requests keep what they accepted.`,
      );
      setNote("");
      qc.invalidateQueries({ queryKey: ["my-terms", pid] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't publish. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-5">
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">Rental terms</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fill what applies. Anything left "Not specified" is shown honestly to tenants. Each
            publish creates a new version; tenants who already accepted keep their original copy.
          </p>
        </header>

        {props.isLoading && <Loader2 className="size-5 animate-spin" />}
        {props.data?.length === 0 && (
          <p className="text-sm text-muted-foreground">Add a property first.</p>
        )}
        {!!props.data?.length && (
          <label className="block max-w-sm text-sm">
            <span className="text-xs text-muted-foreground">Property</span>
            <select className={sel} value={pid} onChange={(e) => setPid(e.target.value)}>
              {props.data.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {detail.isLoading && pid && <Loader2 className="size-5 animate-spin" />}
        {detail.isError && (
          <p role="alert" className="text-sm text-destructive">
            Couldn't load terms for this property.
          </p>
        )}

        {detail.data && (
          <>
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <CompletenessBadge terms={detail.data.version ? t : null} />
              <span className="text-muted-foreground">
                Current version: {detail.data.version ?? "none yet"} · Draft completeness{" "}
                {completeness(t)}%
              </span>
            </div>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-medium">Money</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <Pick
                  name="Electricity"
                  value={t.electricity}
                  opts={[NS, "included", "metered", "fixed"]}
                  onChange={(v) => set("electricity", v as Terms["electricity"])}
                />
                <Num
                  name="Electricity rate"
                  suffix="₹/unit or ₹/month"
                  value={t.electricity_rate}
                  onChange={(v) => set("electricity_rate", v)}
                />
                <Num
                  name="Maintenance charge"
                  suffix="₹/month"
                  value={t.maintenance_charge}
                  onChange={(v) => set("maintenance_charge", v)}
                />
                <Num
                  name="Deposit refund within"
                  suffix="days"
                  value={t.deposit_refund_days}
                  onChange={(v) => set("deposit_refund_days", v === null ? null : Math.round(v))}
                />
                <Num
                  name="Rent increase"
                  suffix="%"
                  value={t.rent_escalation.percent}
                  onChange={(v) => set("rent_escalation", { ...t.rent_escalation, percent: v })}
                />
                <Num
                  name="Increase every"
                  suffix="months"
                  value={t.rent_escalation.every_months}
                  onChange={(v) =>
                    set("rent_escalation", {
                      ...t.rent_escalation,
                      every_months: v === null ? null : Math.round(v),
                    })
                  }
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Rent and deposit come from each room's own price.
              </p>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-medium">Stay</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <Num
                  name="Notice period"
                  suffix="days"
                  value={t.notice_period_days}
                  onChange={(v) => set("notice_period_days", v === null ? null : Math.round(v))}
                />
                <Num
                  name="Lock-in"
                  suffix="months"
                  value={t.lock_in_months}
                  onChange={(v) => set("lock_in_months", v === null ? null : Math.round(v))}
                />
                <Pick
                  name="Agreement"
                  value={t.agreement}
                  opts={[NS, "required", "not_required"]}
                  onChange={(v) => set("agreement", v as Terms["agreement"])}
                />
                <Pick
                  name="ID proof required"
                  value={t.id_proof_required}
                  opts={TRI}
                  onChange={(v) => set("id_proof_required", v as Terms["id_proof_required"])}
                />
                <Pick
                  name="Police verification"
                  value={t.police_verification}
                  opts={TRI}
                  onChange={(v) => set("police_verification", v as Terms["police_verification"])}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-medium">House rules</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <Pick
                  name="Tenants"
                  value={t.gender}
                  opts={[NS, "male", "female", "any"]}
                  onChange={(v) => set("gender", v as Terms["gender"])}
                />
                <Pick
                  name="Visitors"
                  value={t.visitors}
                  opts={[NS, "allowed", "limited", "not_allowed"]}
                  onChange={(v) => set("visitors", v as Terms["visitors"])}
                />
                <Pick
                  name="Smoking"
                  value={t.smoking}
                  opts={ALLOW}
                  onChange={(v) => set("smoking", v as Terms["smoking"])}
                />
                <Pick
                  name="Alcohol"
                  value={t.alcohol}
                  opts={ALLOW}
                  onChange={(v) => set("alcohol", v as Terms["alcohol"])}
                />
                <Pick
                  name="Pets"
                  value={t.pets}
                  opts={ALLOW}
                  onChange={(v) => set("pets", v as Terms["pets"])}
                />
                <Pick
                  name="Cooking"
                  value={t.cooking}
                  opts={TRI}
                  onChange={(v) => set("cooking", v as Terms["cooking"])}
                />
                <Pick
                  name="Curfew"
                  value={t.curfew.enabled}
                  opts={TRI}
                  onChange={(v) =>
                    set("curfew", {
                      enabled: v as Terms["curfew"]["enabled"],
                      time: v === "yes" ? t.curfew.time : null,
                    })
                  }
                />
                {t.curfew.enabled === "yes" && (
                  <label className="block text-sm">
                    <span className="text-xs text-muted-foreground">Curfew time</span>
                    <input
                      type="time"
                      className={sel}
                      value={t.curfew.time ?? ""}
                      onChange={(e) => set("curfew", { ...t.curfew, time: e.target.value || null })}
                    />
                  </label>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 space-y-3">
              <h2 className="font-medium">Facilities</h2>
              <div className="grid sm:grid-cols-3 gap-3">
                <Pick
                  name="Food included"
                  value={t.food.included}
                  opts={TRI}
                  onChange={(v) =>
                    set("food", { ...t.food, included: v as Terms["food"]["included"] })
                  }
                />
                <Pick
                  name="Meals"
                  value={t.food.meals}
                  opts={[NS, "none", "breakfast", "two_meals", "three_meals"]}
                  onChange={(v) => set("food", { ...t.food, meals: v as Terms["food"]["meals"] })}
                />
                <Pick
                  name="Food type"
                  value={t.food.type}
                  opts={[NS, "veg", "non_veg", "both"]}
                  onChange={(v) => set("food", { ...t.food, type: v as Terms["food"]["type"] })}
                />
                <Pick
                  name="AC"
                  value={t.ac}
                  opts={TRI}
                  onChange={(v) => set("ac", v as Terms["ac"])}
                />
                <Pick
                  name="Wi-Fi"
                  value={t.wifi}
                  opts={TRI}
                  onChange={(v) => set("wifi", v as Terms["wifi"])}
                />
                <Pick
                  name="Laundry"
                  value={t.laundry}
                  opts={TRI}
                  onChange={(v) => set("laundry", v as Terms["laundry"])}
                />
                <Pick
                  name="Two-wheeler parking"
                  value={t.parking_two_wheeler}
                  opts={TRI}
                  onChange={(v) => set("parking_two_wheeler", v as Terms["parking_two_wheeler"])}
                />
                <Pick
                  name="Car parking"
                  value={t.parking_four_wheeler}
                  opts={TRI}
                  onChange={(v) => set("parking_four_wheeler", v as Terms["parking_four_wheeler"])}
                />
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-4 grid sm:grid-cols-2 gap-3">
              <Lines
                name="Landlord is responsible for"
                value={t.landlord_responsibilities}
                onChange={(v) =>
                  set(
                    "landlord_responsibilities",
                    v.filter((x) => x.trim() || true),
                  )
                }
              />
              <Lines
                name="Tenant is responsible for"
                value={t.tenant_responsibilities}
                onChange={(v) => set("tenant_responsibilities", v)}
              />
              <label className="block text-sm sm:col-span-2">
                <span className="text-xs text-muted-foreground">Other rules (optional)</span>
                <textarea
                  className={sel}
                  rows={3}
                  maxLength={1000}
                  value={t.extra_rules}
                  onChange={(e) => set("extra_rules", e.target.value)}
                />
              </label>
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="font-medium mb-2">Preview as tenants see it</h2>
              <TermsView
                terms={{
                  ...t,
                  landlord_responsibilities: t.landlord_responsibilities.filter((x) => x.trim()),
                  tenant_responsibilities: t.tenant_responsibilities.filter((x) => x.trim()),
                }}
                rent={8000}
                deposit={16000}
              />
              <p className="text-[11px] text-muted-foreground mt-2">
                Sample rent ₹8,000 / deposit ₹16,000 shown for preview only.
              </p>
            </section>

            {err && (
              <p role="alert" className="text-sm text-destructive">
                {err}
              </p>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className={sel + " max-w-xs"}
                placeholder="What changed? (optional)"
                value={note}
                maxLength={300}
                onChange={(e) => setNote(e.target.value)}
              />
              <button
                onClick={save}
                disabled={busy || !pid}
                className="rounded-xl bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium disabled:opacity-60 inline-flex items-center gap-2"
              >
                {busy && <Loader2 className="size-4 animate-spin" />} Publish new version
              </button>
            </div>

            {detail.data.versions.length > 0 && (
              <section>
                <h2 className="font-medium mb-1 text-sm">Version history</h2>
                <div className="rounded-xl border border-border divide-y divide-border bg-card text-sm">
                  {detail.data.versions.map(
                    (v: {
                      version: number;
                      completeness: number;
                      change_note: string | null;
                      created_at: string;
                    }) => (
                      <div key={v.version} className="p-2.5 flex flex-wrap gap-x-4">
                        <b>v{v.version}</b>
                        <span>{new Date(v.created_at).toLocaleString("en-IN")}</span>
                        <span>{v.completeness}% complete</span>
                        {v.change_note && (
                          <span className="text-muted-foreground">— {v.change_note}</span>
                        )}
                      </div>
                    ),
                  )}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </AppShell>
  );
}
