import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Roommate Match — free, rule-based compatibility scoring.
 *
 * This is NOT an LLM call (no paid AI API involved, by design — see
 * chat). It's a weighted scoring algorithm over structured fields
 * (budget overlap, sleep schedule, smoking, diet, age proximity),
 * which is actually a better fit here than an LLM: instant, free,
 * deterministic, and works even for thousands of candidates without
 * per-request API cost. If a natural-language "why you two would get
 * along" blurb is wanted later, that's a small, optional add-on on
 * top of this — not required for the matching itself.
 */

const RoommateProfileSchema = z.object({
  age: z.number().int().min(16).max(90).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  city: z.string().min(1).max(80).optional().nullable(),
  occupation: z.string().max(120).optional().nullable(),
  bio: z.string().max(300).optional().nullable(),
  smoking: z.boolean().optional().nullable(),
  sleep_schedule: z.enum(["early_bird", "night_owl"]).optional().nullable(),
  diet: z.enum(["veg", "non_veg", "vegan"]).optional().nullable(),
  budget_min: z.number().nonnegative().optional().nullable(),
  budget_max: z.number().nonnegative().optional().nullable(),
  looking_for_roommate: z.boolean(),
});

export const saveRoommateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RoommateProfileSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("myr_user_profiles")
      .upsert({ user_id: userId, ...data }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const stopLookingForRoommate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("myr_user_profiles")
      .update({ looking_for_roommate: false })
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type Candidate = {
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
};

function scoreMatch(me: Candidate, other: Candidate): { score: number; sharedTraits: string[] } {
  let score = 0;
  let max = 0;
  const sharedTraits: string[] = [];

  // Budget overlap — weight 30
  max += 30;
  if (
    me.budget_min != null &&
    me.budget_max != null &&
    other.budget_min != null &&
    other.budget_max != null
  ) {
    const overlap =
      Math.min(me.budget_max, other.budget_max) - Math.max(me.budget_min, other.budget_min);
    if (overlap >= 0) {
      score += 30;
      sharedTraits.push("Budget matches");
    } else if (overlap > -2000) score += 15;
  }

  // Sleep schedule — weight 20
  max += 20;
  if (me.sleep_schedule && other.sleep_schedule) {
    if (me.sleep_schedule === other.sleep_schedule) {
      score += 20;
      sharedTraits.push(me.sleep_schedule === "night_owl" ? "Both night owls" : "Both early birds");
    }
  }

  // Smoking — weight 20
  max += 20;
  if (me.smoking != null && other.smoking != null) {
    if (me.smoking === other.smoking) {
      score += 20;
      sharedTraits.push(me.smoking ? "Both smoke" : "Both non-smokers");
    }
  }

  // Diet — weight 15
  max += 15;
  if (me.diet && other.diet) {
    if (me.diet === other.diet) {
      score += 15;
      sharedTraits.push(`Both ${other.diet.replace("_", "-")}`);
    } else if (
      (me.diet === "veg" && other.diet === "vegan") ||
      (me.diet === "vegan" && other.diet === "veg")
    )
      score += 8;
  }

  // Age proximity — weight 15
  max += 15;
  if (me.age != null && other.age != null) {
    const diff = Math.abs(me.age - other.age);
    score += Math.max(0, 15 - diff * 2);
    if (diff <= 2) sharedTraits.push("Similar age");
  }

  return { score: max > 0 ? Math.round((score / max) * 100) : 50, sharedTraits };
}

const MatchesSchema = z.object({ limit: z.number().int().positive().max(50).optional() });

export const getRoommateMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MatchesSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: me } = await supabase
      .from("myr_user_profiles")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || !me.looking_for_roommate) {
      return { matches: [], myProfile: me ?? null };
    }

    let q = supabase
      .from("myr_user_profiles")
      .select(
        "user_id, display_name, photo_url, age, gender, city, occupation, bio, smoking, sleep_schedule, diet, budget_min, budget_max",
      )
      .eq("looking_for_roommate", true)
      .neq("user_id", userId);
    if (me.city) q = q.eq("city", me.city);

    const { data: candidates, error } = await q.limit(200);
    if (error) throw new Error(error.message);

    const scored = (candidates ?? [])
      .map((c) => ({ ...c, ...scoreMatch(me as Candidate, c as Candidate) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, data.limit ?? 12);

    return { matches: scored, myProfile: me };
  });
