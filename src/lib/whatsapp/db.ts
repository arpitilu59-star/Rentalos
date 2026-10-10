import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client typed loosely: the generated Database types are
 * produced from the live schema and don't include the WhatsApp tables until
 * `supabase gen types` is re-run after applying the migration.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getAdmin(): Promise<SupabaseClient<any>> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as unknown as SupabaseClient<any>;
}
