import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AdminRole =
  | "root_owner"
  | "full_admin"
  | "support_admin"
  | "subscription_admin"
  | "property_admin"
  | "finance_admin";

type JsonValue = string | number | boolean | null | { [k: string]: JsonValue } | JsonValue[];
export type AdminUser = {
  id: string;
  user_id: string;
  role: AdminRole;
  permissions: JsonValue;
  active: boolean;
  created_by: string | null;
  created_at: string;
};

/** Returns the caller's admin row, or null if not an admin. */
export const getMyAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase
      .from("admin_users")
      .select("*")
      .eq("user_id", userId)
      .eq("active", true)
      .maybeSingle();
    return (data as AdminUser | null) ?? null;
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function writeAudit(
  supabase: any,
  admin_user_id: string,
  action: string,
  target_type: string | null,
  target_id: string | null,
  metadata: Record<string, unknown> = {},
) {
  const ip = getRequestHeader("x-forwarded-for") ?? getRequestHeader("x-real-ip") ?? null;
  const ua = getRequestHeader("user-agent") ?? null;
  await supabase.from("admin_audit_logs").insert({
    admin_user_id, action, target_type, target_id, metadata, ip_address: ip, user_agent: ua,
  });
}

/** High-level dashboard counts and recent activity. Uses admin client to see across all tenants. */
export const getAdminDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("*").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data) throw new Error("FORBIDDEN");

    const [profiles, properties, rooms, tenants, bills, payments, recentAudits, recentLogins] = await Promise.all([
      supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("properties").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("rooms").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("tenants").select("id", { count: "exact", head: true }),
      supabaseAdmin.from("bills").select("status, total_amount, amount_paid"),
      supabaseAdmin.from("payments").select("amount, paid_on"),
      supabaseAdmin.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(20),
      supabaseAdmin.from("admin_login_events").select("*").order("created_at", { ascending: false }).limit(20),
    ]);

    const billsArr = (bills.data ?? []) as Array<{ status: string; total_amount: number; amount_paid: number }>;
    const totalBilled = billsArr.reduce((s, b) => s + Number(b.total_amount || 0), 0);
    const totalCollected = billsArr.reduce((s, b) => s + Number(b.amount_paid || 0), 0);
    const pendingCount = billsArr.filter((b) => b.status !== "paid").length;
    const paidCount = billsArr.filter((b) => b.status === "paid").length;

    return {
      me: me.data,
      counts: {
        users: profiles.count ?? 0,
        properties: properties.count ?? 0,
        rooms: rooms.count ?? 0,
        tenants: tenants.count ?? 0,
        billsPaid: paidCount,
        billsPending: pendingCount,
      },
      money: {
        totalBilled,
        totalCollected,
        outstanding: totalBilled - totalCollected,
        paymentsCount: payments.data?.length ?? 0,
      },
      recentAudits: recentAudits.data ?? [],
      recentLogins: recentLogins.data ?? [],
    };
  });

/** Lists ALL landlord profiles across the platform. Uses admin client (bypasses RLS). */
export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("role,id").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data) throw new Error("FORBIDDEN");
    const { data } = await supabaseAdmin.from("profiles").select("*").order("created_at", { ascending: false });
    return data ?? [];
  });

export const adminListTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("role").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data) throw new Error("FORBIDDEN");
    const { data } = await supabaseAdmin.from("tenants").select("*").order("created_at", { ascending: false }).limit(2000);
    return data ?? [];
  });

export const adminListAdmins = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("role").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data) throw new Error("FORBIDDEN");
    const { data } = await supabaseAdmin.from("admin_users").select("*").order("created_at", { ascending: true });
    return data ?? [];
  });

/** Admin diagnostics: counts across auth, profiles, tenants + missing-record detection. */
export const adminDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("role").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data) throw new Error("FORBIDDEN");

    const [authList, profiles, tenants, properties, rooms, bills] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id,email,full_name,created_at"),
      supabaseAdmin.from("tenants").select("id,owner_id,name"),
      supabaseAdmin.from("properties").select("id,owner_id"),
      supabaseAdmin.from("rooms").select("id,owner_id"),
      supabaseAdmin.from("bills").select("id,owner_id"),
    ]);

    const authUsers = authList.data?.users ?? [];
    const profileIds = new Set((profiles.data ?? []).map((p) => p.id));
    const missingProfiles = authUsers
      .filter((u) => !profileIds.has(u.id))
      .map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at }));

    return {
      counts: {
        authUsers: authUsers.length,
        profiles: profiles.data?.length ?? 0,
        tenants: tenants.data?.length ?? 0,
        properties: properties.data?.length ?? 0,
        rooms: rooms.data?.length ?? 0,
        bills: bills.data?.length ?? 0,
      },
      missingProfiles,
      recentAuthUsers: authUsers
        .slice()
        .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
        .slice(0, 20)
        .map((u) => ({ id: u.id, email: u.email ?? null, created_at: u.created_at, last_sign_in_at: u.last_sign_in_at ?? null })),
    };
  });


const CreateAdminInput = z.object({
  email: z.string().email().max(255),
  role: z.enum(["full_admin", "support_admin", "subscription_admin", "property_admin", "finance_admin"]),
});

export const adminCreateAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => CreateAdminInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("id,role").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data || me.data.role !== "root_owner") throw new Error("FORBIDDEN: only root owner");

    // Find target user by email (must already have signed up)
    const { data: profile } = await supabaseAdmin.from("profiles").select("id").eq("email", data.email).maybeSingle();
    if (!profile) throw new Error("User with that email must sign up first.");

    const { error } = await supabase.from("admin_users").insert({
      user_id: profile.id, role: data.role, created_by: userId,
    });
    if (error) throw new Error(error.message);
    await writeAudit(supabase, me.data.id, "create_admin", "admin_user", profile.id, { email: data.email, role: data.role });
    return { ok: true };
  });

const RevokeInput = z.object({ admin_user_row_id: z.string().uuid() });
export const adminRevokeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => RevokeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const me = await supabase.from("admin_users").select("id,role").eq("user_id", userId).eq("active", true).maybeSingle();
    if (!me.data || me.data.role !== "root_owner") throw new Error("FORBIDDEN: only root owner");

    const { error } = await supabase.from("admin_users").update({ active: false }).eq("id", data.admin_user_row_id);
    if (error) throw new Error(error.message);
    await writeAudit(supabase, me.data.id, "revoke_admin", "admin_user", data.admin_user_row_id);
    return { ok: true };
  });

/** Records a login attempt (success or failure) — called from the admin login page. */
const LoginEventInput = z.object({
  email: z.string().email().max(255),
  success: z.boolean(),
  device_fingerprint: z.string().max(256).optional(),
});
export const recordAdminLogin = createServerFn({ method: "POST" })
  .inputValidator((d) => LoginEventInput.parse(d))
  .handler(async ({ data }) => {
    // Intentionally no auth middleware — we log failed attempts too.
    // RLS allows inserts with check=true on admin_login_events.
    const ip = getRequestHeader("x-forwarded-for") ?? getRequestHeader("x-real-ip") ?? null;
    const ua = getRequestHeader("user-agent") ?? null;

    // Use a non-auth client (no token). Read service URL/anon key from env.
    const url = process.env.SUPABASE_URL!;
    const anon = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const res = await fetch(`${url}/rest/v1/admin_login_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email: data.email,
        success: data.success,
        ip_address: ip,
        user_agent: ua,
        device_fingerprint: data.device_fingerprint ?? null,
      }),
    });
    if (!res.ok) console.warn("[admin-login-event] insert failed:", res.status);
    return { ok: true };
  });
