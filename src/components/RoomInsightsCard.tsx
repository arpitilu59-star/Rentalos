import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowUpRight, BarChart3, ChevronDown, Eye, Heart, Mail, ShieldCheck } from "lucide-react";
import { getMyRoomInsights, updateMyInsightPreferences } from "@/lib/room-insights.functions";
import { insightTip, type RoomInsights } from "@/lib/room-insights";

export function RoomInsightsCard() {
  const get = useServerFn(getMyRoomInsights),
    save = useServerFn(updateMyInsightPreferences);
  const q = useQuery({ queryKey: ["room-insights"], queryFn: () => get() });
  const [open, setOpen] = useState(false);
  const mutation = useMutation({
    mutationFn: (p: RoomInsights["preferences"]) => save({ data: p }),
    onSuccess: () => q.refetch(),
  });
  const d = q.data;
  return (
    <section
      aria-label="Room visit insights"
      className="overflow-hidden rounded-3xl border border-border shadow-card"
    >
      <div className="bg-brand-navy px-5 py-6 text-white sm:p-7">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-brand-gold-light">
            YOUR ROOMS · LAST 7 DAYS
          </p>
          <BarChart3 className="size-5 text-brand-gold-light" />
        </div>
        <h2 className="mt-2 text-lg font-semibold">Room activity this week</h2>
        {q.isError ? (
          <div role="alert" className="mt-6 text-sm text-slate-200">
            Insights could not load.{" "}
            <button onClick={() => void q.refetch()} className="min-h-11 underline">
              Try again
            </button>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-3 gap-3">
            {[
              ["Daily unique views", d?.totals.views, Eye],
              ["Saves", d?.totals.saves, Heart],
              ["Requests", d?.totals.requests, Mail],
            ].map(([label, value, Icon]) => {
              const I = Icon as typeof Eye;
              return (
                <div key={String(label)}>
                  <I aria-hidden="true" className="mb-2 size-4 text-brand-gold-light" />
                  <p className="break-all text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                    {value == null ? "—" : Number(value).toLocaleString("en-IN")}
                  </p>
                  <p className="mt-1 text-xs text-slate-300 sm:text-sm">{String(label)}</p>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-6 flex items-start gap-2 border-t border-white/15 pt-4 text-xs leading-relaxed text-slate-300">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            Sirf count, kaun aaya ye nahi dikhta. One viewer per room per day; repeat visits on
            different days count separately.
          </p>
        </div>
        <button
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="mt-3 flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-gold-light"
        >
          {open ? "Hide details" : "Explore room performance"}
          <ChevronDown className={`size-4 ${open ? "rotate-180" : ""}`} />
        </button>
      </div>
      {open && d && (
        <div className="space-y-6 bg-card p-5 sm:p-7">
          <div>
            <h3 className="font-semibold">Interest to bookings</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Activity during the last 7 days; stages are event counts, not a conversion-rate
              cohort.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {[
                ["Views", d.totals.views],
                ["Saves", d.totals.saves],
                ["Offers", d.totals.offers],
                ["Requests", d.totals.requests],
                ["Bookings", d.totals.bookings],
              ].map(([label, v]) => (
                <div key={label} className="rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>
          <div>
            <h3 className="font-semibold">Your rooms</h3>
            {d.rooms.length ? (
              <ul className="mt-3 divide-y divide-border">
                {d.rooms.map((r) => (
                  <li key={r.room_id} className="py-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <a
                        href={`/rooms/${r.room_id}/analysis`}
                        className="inline-flex min-h-11 items-center gap-2 font-medium"
                      >
                        Room {r.room_number}
                        <ArrowUpRight className="size-4" />
                      </a>
                      <span className="text-xs text-muted-foreground">
                        {r.video_completions} full video plays
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.views} views · {r.saves} saves · {r.offers} offers · {r.requests} requests
                      · {r.bookings} bookings
                    </p>
                    {insightTip(r) && (
                      <p className="mt-2 rounded-lg bg-accent p-3 text-xs leading-relaxed text-accent-foreground">
                        {insightTip(r)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">
                Add and publish a room to start seeing real activity here.
              </p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-5 border-t border-border pt-5">
            <label className="text-sm">
              Summary notifications
              <select
                value={d.preferences.summary_frequency}
                disabled={mutation.isPending}
                onChange={(e) =>
                  mutation.mutate({
                    ...d.preferences,
                    summary_frequency: e.target
                      .value as RoomInsights["preferences"]["summary_frequency"],
                  })
                }
                className="ml-3 min-h-11 rounded-lg border border-input bg-background px-3"
              >
                <option value="weekly">Weekly</option>
                <option value="daily">Daily</option>
                <option value="off">Off</option>
              </select>
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={d.preferences.signals_enabled}
                disabled={mutation.isPending}
                onChange={(e) =>
                  mutation.mutate({ ...d.preferences, signals_enabled: e.target.checked })
                }
              />
              Save & video notifications
            </label>
          </div>
          {mutation.isError && (
            <p role="alert" className="text-sm text-destructive">
              Preferences could not save. Try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
