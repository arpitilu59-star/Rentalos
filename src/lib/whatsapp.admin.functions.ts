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

/** Admin: delivery health. Counts + recent log; no phone numbers, no message text. */
export const getWhatsAppOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { getAdmin } = await import("./whatsapp/db");
    const { isMetaConfigured } = await import("./whatsapp/meta-client");
    const admin = await getAdmin();
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [msgs, linked, optedIn] = await Promise.all([
      admin
        .from("whatsapp_messages")
        .select("id, direction, event_type, template, status, failure_reason, attempts, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(200),
      admin
        .from("whatsapp_links")
        .select("user_id", { count: "exact", head: true })
        .eq("verified", true),
      admin
        .from("whatsapp_links")
        .select("user_id", { count: "exact", head: true })
        .eq("verified", true)
        .eq("opted_in", true),
    ]);
    if (msgs.error) throw new Error("Couldn't load WhatsApp activity.");

    const rows = (msgs.data ?? []) as {
      id: string;
      direction: string;
      event_type: string;
      template: string | null;
      status: string;
      failure_reason: string | null;
      attempts: number;
      created_at: string;
    }[];
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;

    return {
      live: isMetaConfigured(),
      webhookSecretSet: Boolean(process.env.META_APP_SECRET),
      verifyTokenSet: Boolean(process.env.META_WHATSAPP_VERIFY_TOKEN),
      dispatchSecretSet: Boolean(process.env.WHATSAPP_DISPATCH_SECRET),
      linkedUsers: linked.count ?? 0,
      optedInUsers: optedIn.count ?? 0,
      counts,
      recent: rows.slice(0, 50),
    };
  });

/** Landlord (RentDesk): own WhatsApp status + last events. Own rows only. */
export const getMyAutomationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("./whatsapp/db");
    const { isMetaConfigured } = await import("./whatsapp/meta-client");
    const admin = await getAdmin();
    const [link, msgs] = await Promise.all([
      admin
        .from("whatsapp_links")
        .select("verified, opted_in")
        .eq("user_id", context.userId)
        .maybeSingle(),
      admin
        .from("whatsapp_messages")
        .select("event_type, status, created_at")
        .eq("user_id", context.userId)
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(5),
    ]);
    if (link.error || msgs.error) throw new Error("Couldn't load automation status.");
    return {
      live: isMetaConfigured(),
      linked: Boolean(link.data?.verified),
      optedIn: Boolean(link.data?.opted_in),
      recent: (msgs.data ?? []) as { event_type: string; status: string; created_at: string }[],
    };
  });
