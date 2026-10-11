import { ShieldCheck, Info } from "lucide-react";
import { NS, label, rentSchedule, completeness, type Terms } from "@/lib/terms/schema";

const Row = ({ k, v }: { k: string; v: string }) => (
  <div className="flex justify-between gap-3 py-1.5 border-b border-border/60 last:border-0 text-sm">
    <span className="text-muted-foreground">{k}</span>
    <span
      className={`text-right ${v === "Not specified" ? "text-muted-foreground/60 italic" : "font-medium"}`}
    >
      {v}
    </span>
  </div>
);
const days = (n: number | null) => (n === null ? "Not specified" : `${n} days`);
const inr = (n: number | null) => (n === null ? "Not specified" : `₹${n.toLocaleString("en-IN")}`);

/** Trust indicator: how much of the terms the landlord actually filled in. */
export function CompletenessBadge({ terms }: { terms: Terms | null }) {
  if (!terms)
    return (
      <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
        <Info className="size-3" /> Terms not published
      </span>
    );
  const c = completeness(terms);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 px-2 py-0.5">
      <ShieldCheck className="size-3" /> Terms {c}% complete
    </span>
  );
}

export function TermsView({
  terms,
  rent,
  deposit,
}: {
  terms: Terms;
  rent: number;
  deposit: number | null;
}) {
  const sched = rentSchedule(rent, terms.rent_escalation, 36);
  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Money
        </h4>
        <Row k="Monthly rent" v={inr(rent)} />
        <Row k="Security deposit" v={inr(deposit)} />
        <Row k="Deposit refund" v={days(terms.deposit_refund_days)} />
        <Row
          k="Electricity"
          v={`${label(terms.electricity)}${terms.electricity_rate !== null && terms.electricity !== NS ? ` · ₹${terms.electricity_rate}` : ""}`}
        />
        <Row k="Maintenance charge" v={inr(terms.maintenance_charge)} />
        {sched.length > 1 ? (
          <div className="mt-2 rounded-lg bg-muted/50 p-3 text-xs space-y-0.5">
            <div className="font-medium">
              Rent increase: {terms.rent_escalation.percent}% every{" "}
              {terms.rent_escalation.every_months} months
            </div>
            {sched.map((s) => (
              <div key={s.fromMonth} className="flex justify-between">
                <span>From month {s.fromMonth}</span>
                <span>₹{s.rent.toLocaleString("en-IN")}</span>
              </div>
            ))}
          </div>
        ) : (
          <Row
            k="Rent increase"
            v={terms.rent_escalation.percent === 0 ? "None" : "Not specified"}
          />
        )}
      </section>
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Stay
        </h4>
        <Row k="Notice period" v={days(terms.notice_period_days)} />
        <Row
          k="Lock-in"
          v={terms.lock_in_months === null ? "Not specified" : `${terms.lock_in_months} months`}
        />
        <Row k="Agreement" v={label(terms.agreement)} />
        <Row k="ID proof" v={label(terms.id_proof_required)} />
        <Row k="Police verification" v={label(terms.police_verification)} />
      </section>
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          House rules
        </h4>
        <Row k="Tenants" v={label(terms.gender)} />
        <Row k="Visitors" v={label(terms.visitors)} />
        <Row k="Smoking" v={label(terms.smoking)} />
        <Row k="Alcohol" v={label(terms.alcohol)} />
        <Row k="Pets" v={label(terms.pets)} />
        <Row
          k="Curfew"
          v={
            terms.curfew.enabled === "yes"
              ? `Yes${terms.curfew.time ? ` · ${terms.curfew.time}` : ""}`
              : label(terms.curfew.enabled)
          }
        />
        <Row k="Cooking" v={label(terms.cooking)} />
      </section>
      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
          Facilities
        </h4>
        <Row
          k="Food"
          v={
            terms.food.included === "yes"
              ? `${label(terms.food.meals)} · ${label(terms.food.type)}`
              : label(terms.food.included)
          }
        />
        <Row k="AC" v={label(terms.ac)} />
        <Row k="Wi-Fi" v={label(terms.wifi)} />
        <Row k="Laundry" v={label(terms.laundry)} />
        <Row k="Two-wheeler parking" v={label(terms.parking_two_wheeler)} />
        <Row k="Car parking" v={label(terms.parking_four_wheeler)} />
      </section>
      {(terms.landlord_responsibilities.length > 0 || terms.tenant_responsibilities.length > 0) && (
        <section className="grid sm:grid-cols-2 gap-3 text-sm">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              Landlord is responsible for
            </h4>
            <ul className="list-disc pl-4 space-y-0.5">
              {terms.landlord_responsibilities.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              You are responsible for
            </h4>
            <ul className="list-disc pl-4 space-y-0.5">
              {terms.tenant_responsibilities.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
      {terms.extra_rules && (
        <section>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
            Other rules
          </h4>
          <p className="text-sm whitespace-pre-wrap">{terms.extra_rules}</p>
        </section>
      )}
    </div>
  );
}
