import { useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { activeFilterCount, type TermsFilters } from "@/lib/terms/match";

type BoolKey =
  | "pets"
  | "smoking"
  | "alcohol"
  | "visitors"
  | "noCurfew"
  | "cooking"
  | "ac"
  | "wifi"
  | "electricityIncluded"
  | "agreementNotRequired";
const TOGGLES: { key: BoolKey; text: string }[] = [
  { key: "pets", text: "Pets allowed" },
  { key: "visitors", text: "Visitors allowed" },
  { key: "smoking", text: "Smoking allowed" },
  { key: "alcohol", text: "Alcohol allowed" },
  { key: "noCurfew", text: "No curfew" },
  { key: "cooking", text: "Cooking allowed" },
  { key: "ac", text: "AC" },
  { key: "wifi", text: "Wi-Fi" },
  { key: "electricityIncluded", text: "Electricity included" },
  { key: "agreementNotRequired", text: "No agreement needed" },
];

const chip = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`;

/** Filter drawer (bottom sheet on mobile feel via Sheet). Chips + a few numeric limits. */
export function TermsFilterDrawer({
  value,
  onChange,
}: {
  value: TermsFilters;
  onChange: (f: TermsFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const n = activeFilterCount(value);
  const set = (patch: Partial<TermsFilters>) => onChange({ ...value, ...patch });
  const toggle = (k: BoolKey) => set({ [k]: value[k] ? undefined : true } as Partial<TermsFilters>);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-accent"
        >
          <SlidersHorizontal className="size-4" /> Rules & facilities
          {n > 0 && (
            <span className="rounded-full bg-primary text-primary-foreground text-[11px] px-1.5">
              {n}
            </span>
          )}
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="max-h-[85vh] overflow-y-auto md:max-w-xl md:mx-auto rounded-t-2xl"
      >
        <SheetHeader>
          <SheetTitle>Filter by terms</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 py-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Tenants</div>
            <div className="flex gap-2 flex-wrap">
              {(["male", "female"] as const).map((g) => (
                <button
                  key={g}
                  type="button"
                  className={chip(value.gender === g)}
                  onClick={() => set({ gender: value.gender === g ? undefined : g })}
                >
                  {g === "male" ? "Male" : "Female"} tenants
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Food</div>
            <div className="flex gap-2 flex-wrap">
              <button
                type="button"
                className={chip(value.food === "included")}
                onClick={() => set({ food: value.food === "included" ? undefined : "included" })}
              >
                Food included
              </button>
              <button
                type="button"
                className={chip(value.food === "veg")}
                onClick={() => set({ food: value.food === "veg" ? undefined : "veg" })}
              >
                Veg available
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Parking</div>
            <div className="flex gap-2 flex-wrap">
              {(
                [
                  ["two_wheeler", "Two-wheeler"],
                  ["four_wheeler", "Car"],
                ] as const
              ).map(([k, t]) => (
                <button
                  key={k}
                  type="button"
                  className={chip(value.parking === k)}
                  onClick={() => set({ parking: value.parking === k ? undefined : k })}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Rules & facilities</div>
            <div className="flex gap-2 flex-wrap">
              {TOGGLES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={chip(!!value[t.key])}
                  onClick={() => toggle(t.key)}
                >
                  {t.text}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-muted-foreground">Max notice period (days)</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                inputMode="numeric"
                value={value.maxNoticeDays ?? ""}
                onChange={(e) =>
                  set({
                    maxNoticeDays:
                      e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-muted-foreground">Max lock-in (months)</span>
              <input
                className="mt-1 w-full rounded-lg border border-border bg-background px-2.5 py-2 text-sm"
                inputMode="numeric"
                value={value.maxLockInMonths ?? ""}
                onChange={(e) =>
                  set({
                    maxLockInMonths:
                      e.target.value === "" ? undefined : Math.max(0, Number(e.target.value) || 0),
                  })
                }
              />
            </label>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={value.includeUnknown !== false}
              onChange={(e) => set({ includeUnknown: e.target.checked })}
            />
            <span>Also show listings that don't state these details (marked "not specified")</span>
          </label>
        </div>
        <div className="flex justify-between gap-2 pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => onChange({ includeUnknown: value.includeUnknown })}
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" /> Clear all
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-xl bg-primary text-primary-foreground px-5 py-2 text-sm font-medium"
          >
            Show results
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
