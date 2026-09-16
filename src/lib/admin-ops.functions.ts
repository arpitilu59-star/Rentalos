import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("admin_users")
    .select("id")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden");
}

/**
 * Admin operations overview (Phase 13).
 *
 * Deliberately built ONLY on tables that actually exist and are in
 * active use in this codebase — bills, payments, myr_verifications,
 * live_feed_videos, maintenance_tickets, fraud_flags, automation_runs.
 * No invented metrics, no placeholder numbers: every figure below is a
 * real count from a real query. Uses the service-role client because
 * this is a cross-tenant operational view (an admin legitimately needs
 * to see every landlord's overdue bills, not just their own).
 */
export const getAdminOpsOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const today = new Date().toISOString().slice(0, 10);

    const [
      overdueBills,
      dueToday,
      unverifiedPayments,
      pendingKyc,
      pendingVideos,
      openTickets,
      openFraud,
      failedAutomations,
    ] = await Promise.all([
      supabaseAdmin
        .from("bills")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
        .eq("archived", false)
        .lt("due_date", today),
      supabaseAdmin
        .from("bills")
        .select("id", { count: "exact", head: true })
        .neq("status", "paid")
        .eq("archived", false)
        .eq("due_date", today),
      supabaseAdmin
        .from("payments")
        .select("id", { count: "exact", head: true })
        .neq("verification_status", "verified"),
      supabaseAdmin
        .from("myr_verifications")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending"),
      supabaseAdmin
        .from("live_feed_videos")
        .select("id", { count: "exact", head: true })
        .in("verification_status", ["pending", "flagged"]),
      supabaseAdmin
        .from("maintenance_tickets")
        .select("id", { count: "exact", head: true })
        .in("status", ["open", "in_progress"]),
      supabaseAdmin
        .from("fraud_flags")
        .select("id", { count: "exact", head: true })
        .eq("resolved", false),
      supabaseAdmin
        .from("automation_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed")
        .gte("created_at", new Date(Date.now() - 7 * 864e5).toISOString()),
    ]);

    return {
      overdueBills: overdueBills.count ?? 0,
      dueToday: dueToday.count ?? 0,
      unverifiedPayments: unverifiedPayments.count ?? 0,
      pendingKyc: pendingKyc.count ?? 0,
      pendingVideos: pendingVideos.count ?? 0,
      openTickets: openTickets.count ?? 0,
      openFraud: openFraud.count ?? 0,
      failedAutomations: failedAutomations.count ?? 0,
    };
  });

/** Recent automation activity — the observability view (Phase 18). */
export const listAutomationRuns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("automation_runs")
      .select(
        "id, job, entity_type, entity_id, period_key, status, error, created_at, completed_at",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return { runs: data ?? [] };
  });
