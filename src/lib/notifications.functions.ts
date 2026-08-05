import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, supabase } = context;
    const { data, error } = await supabase
      .from("myr_notifications")
      .select("id, kind, title, body, link, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    const unread = (data ?? []).filter((n: any) => !n.read_at).length;
    return { items: data ?? [], unread };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid().optional(), all: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    const q = supabase.from("myr_notifications").update({ read_at: new Date().toISOString() }).eq("user_id", userId);
    if (data.all) await q.is("read_at", null);
    else if (data.id) await q.eq("id", data.id);
    return { ok: true };
  });
