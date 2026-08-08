import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  saveRoommateProfile,
  getRoommateMatches,
  stopLookingForRoommate,
} from "@/lib/myr-roommate.functions";
import {
  Loader2,
  ArrowLeft,
  Users,
  Sparkles,
  Cigarette,
  Moon,
  Sun,
  Salad,
  IndianRupee,
} from "lucide-react";

export const Route = createFileRoute("/myr/roommates")({
  component: RoommatesPage,
  head: () => ({ meta: [{ title: "Find a roommate — ManageYourRoom" }] }),
});

type Match = {
  user_id: string;
  display_name: string | null;
  age: number | null;
  gender: string | null;
  city: string | null;
  occupation: string | null;
  bio: string | null;
  smoking: boolean | null;
  sleep_schedule: string | null;
  diet: string | null;
  budget_min: number | null;
  budget_max: number | null;
  score: number;
  sharedTraits: string[];
};

function RoommatesPage() {
  const nav = useNavigate();
  const doSave = useServerFn(saveRoommateProfile);
  const doGetMatches = useServerFn(getRoommateMatches);
  const doStop = useServerFn(stopLookingForRoommate);

  const [checking, setChecking] = useState(true);
  const [hasProfile, setHasProfile] = useState(false);
  const [matches, setMatches] = useState<Match[]>([]);
  const [loadingMatches, setLoadingMatches] = useState(false);

  // form state
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "">("");
  const [city, setCity] = useState("");
  const [occupation, setOccupation] = useState("");
  const [bio, setBio] = useState("");
  const [smoking, setSmoking] = useState<"yes" | "no" | "">("");
  const [sleep, setSleep] = useState<"early_bird" | "night_owl" | "">("");
  const [diet, setDiet] = useState<"veg" | "non_veg" | "vegan" | "">("");
  const [budgetMin, setBudgetMin] = useState("");
  const [budgetMax, setBudgetMax] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = async () => {
    setLoadingMatches(true);
    try {
      const res = await doGetMatches({ data: {} });
      setMatches(res.matches as Match[]);
      setHasProfile(!!res.myProfile?.looking_for_roommate);
    } finally {
      setLoadingMatches(false);
    }
  };

  useEffect(() => {
    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        nav({ to: "/tenant/login", search: { redirect: "/myr/roommates" } as never });
        return;
      }
      await loadMatches();
      setChecking(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await doSave({
        data: {
          age: age ? Number(age) : null,
          gender: gender || null,
          city: city || null,
          occupation: occupation || null,
          bio: bio || null,
          smoking: smoking === "" ? null : smoking === "yes",
          sleep_schedule: sleep || null,
          diet: diet || null,
          budget_min: budgetMin ? Number(budgetMin) : null,
          budget_max: budgetMax ? Number(budgetMax) : null,
          looking_for_roommate: true,
        },
      });
      setHasProfile(true);
      await loadMatches();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const stop = async () => {
    await doStop();
    setHasProfile(false);
    setMatches([]);
  };

  if (checking) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/myr/browse" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" />
          </Link>
          <div className="flex items-center gap-2 font-semibold">
            <Users className="size-4 text-primary" /> Find a roommate
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        {!hasProfile ? (
          <>
            <h1 className="text-2xl font-semibold tracking-tight">Find your roommate match</h1>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Batao apne baare mein — hum compatibility ke hisaab se best matches dikhayenge.
            </p>
            <form
              onSubmit={submit}
              className="rounded-2xl bg-card border border-border p-6 space-y-4 max-w-lg"
            >
              <div className="grid grid-cols-2 gap-3">
                <Field label="Age">
                  <input
                    type="number"
                    min={16}
                    max={90}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className={input}
                  />
                </Field>
                <Field label="Gender">
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as typeof gender)}
                    className={input}
                  >
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </Field>
              </div>
              <Field label="City">
                <input
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Jaipur"
                  className={input}
                />
              </Field>
              <Field label="College / Workplace">
                <input
                  value={occupation}
                  onChange={(e) => setOccupation(e.target.value)}
                  placeholder="JECRC University"
                  className={input}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Sleep schedule">
                  <select
                    value={sleep}
                    onChange={(e) => setSleep(e.target.value as typeof sleep)}
                    className={input}
                  >
                    <option value="">Select</option>
                    <option value="early_bird">Early bird</option>
                    <option value="night_owl">Night owl</option>
                  </select>
                </Field>
                <Field label="Diet">
                  <select
                    value={diet}
                    onChange={(e) => setDiet(e.target.value as typeof diet)}
                    className={input}
                  >
                    <option value="">Select</option>
                    <option value="veg">Veg</option>
                    <option value="non_veg">Non-veg</option>
                    <option value="vegan">Vegan</option>
                  </select>
                </Field>
              </div>
              <Field label="Smoking">
                <select
                  value={smoking}
                  onChange={(e) => setSmoking(e.target.value as typeof smoking)}
                  className={input}
                >
                  <option value="">Select</option>
                  <option value="no">Non-smoker</option>
                  <option value="yes">Smoker</option>
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Budget min (₹/mo)">
                  <input
                    type="number"
                    min={0}
                    value={budgetMin}
                    onChange={(e) => setBudgetMin(e.target.value)}
                    className={input}
                  />
                </Field>
                <Field label="Budget max (₹/mo)">
                  <input
                    type="number"
                    min={0}
                    value={budgetMax}
                    onChange={(e) => setBudgetMax(e.target.value)}
                    className={input}
                  />
                </Field>
              </div>
              <Field label="Bio (optional)">
                <textarea
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  rows={2}
                  className={input}
                />
              </Field>
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                disabled={saving}
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium disabled:opacity-60"
              >
                {saving && <Loader2 className="size-4 animate-spin" />}
                <Sparkles className="size-4" /> Find matches
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Your matches</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Compatibility ke hisaab se sorted.
                </p>
              </div>
              <button
                onClick={stop}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Stop looking
              </button>
            </div>

            {loadingMatches ? (
              <div className="py-16 grid place-items-center">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : matches.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
                Abhi koi match nahi mila. Jaise-jaise aur log profile banayenge, yahan dikhne
                lagenge.
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4">
                {matches.map((m) => (
                  <div key={m.user_id} className="rounded-2xl bg-card border border-border p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="font-semibold">
                          {m.display_name ?? "Anonymous"}
                          {m.age ? `, ${m.age}` : ""}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {m.occupation ?? m.city ?? ""}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-lg font-bold text-primary">{m.score}%</div>
                        <div className="text-[10px] text-muted-foreground">match</div>
                      </div>
                    </div>
                    {m.bio && <p className="text-xs text-muted-foreground mt-2">{m.bio}</p>}
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {m.diet && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted">
                          <Salad className="size-3" /> {m.diet.replace("_", "-")}
                        </span>
                      )}
                      {m.sleep_schedule && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted">
                          {m.sleep_schedule === "night_owl" ? (
                            <Moon className="size-3" />
                          ) : (
                            <Sun className="size-3" />
                          )}
                          {m.sleep_schedule === "night_owl" ? "Night owl" : "Early bird"}
                        </span>
                      )}
                      {m.smoking != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted">
                          <Cigarette className="size-3" /> {m.smoking ? "Smoker" : "Non-smoker"}
                        </span>
                      )}
                      {m.budget_min != null && m.budget_max != null && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-full bg-muted">
                          <IndianRupee className="size-3" /> {m.budget_min}-{m.budget_max}
                        </span>
                      )}
                    </div>
                    {m.sharedTraits.length > 0 && (
                      <div className="mt-3 text-[11px] text-primary font-medium">
                        {m.sharedTraits.join(" · ")}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const input =
  "w-full px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
