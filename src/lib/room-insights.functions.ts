import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
export const getMyRoomInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getOwnerInsights } = await import("./room-insights.server");
    return getOwnerInsights(context.userId);
  });
export const updateMyInsightPreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        summary_frequency: z.enum(["daily", "weekly", "off"]),
        signals_enabled: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ context, data }) => {
    const { saveInsightPreferences } = await import("./room-insights.server");
    return saveInsightPreferences(context.userId, data);
  });

export const getMyLandlordDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { landlordHome, isLandlord } = await import("./mobile-landlord.server");
    const { getAdmin } = await import("./whatsapp/db");
    if (!(await isLandlord(await getAdmin(), context.userId)))
      throw new Error("Landlord access required.");
    return landlordHome(context.userId);
  });

export const getRoomActivitySpikes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getAdmin } = await import("./whatsapp/db");
    const a = await getAdmin();
    const { data: admin, error: permissionError } = await a
      .from("admin_users")
      .select("user_id")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (permissionError || !admin) throw new Error("Forbidden");
    const { data, error } = await a.rpc("room_activity_spikes");
    if (error) throw new Error("Activity could not load.");
    return {
      rooms: (data ?? []) as {
        room_id: string;
        room_number: string;
        views: number;
        offers: number;
      }[],
    };
  });
