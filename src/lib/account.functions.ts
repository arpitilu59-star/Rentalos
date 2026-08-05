import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RoleSchema = z.object({ role: z.enum(["landlord", "tenant"]) });

/** Idempotently lock the signed-in user's primary role.
 *  Throws ROLE_MISMATCH:<existing> if a different role is already set. */
export const claimRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => RoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: res, error } = await supabase.rpc("claim_primary_role", { _role: data.role });
    if (error) {
      if (error.message?.includes("ROLE_MISMATCH:")) {
        const existing = error.message.split("ROLE_MISMATCH:")[1]?.trim();
        return { ok: false as const, mismatch: true, existing };
      }
      throw new Error(error.message);
    }
    return { ok: true as const, role: res as string };
  });

export const getMyRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await context.supabase.rpc("current_user_role");
    return { role: (data as string | null) ?? null };
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { password?: string }) => input)
  .handler(async ({ data, context }) => {
    const { userId, supabase } = context;
    // Re-auth if password provided (email accounts)
    if (data.password) {
      const { data: u } = await supabase.auth.getUser();
      const email = u.user?.email;
      if (email) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // verify password via sign-in
        const { error: signErr } = await supabaseAdmin.auth.signInWithPassword({ email, password: data.password });
        if (signErr) throw new Error("Incorrect password");
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
