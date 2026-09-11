import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
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

export const listPartnerOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("partner_organizations")
      .select(
        "id, name, contact_email, contact_phone, verified, created_at, partner_org_members(user_id)",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return { orgs: data ?? [] };
  });

const CreateOrgSchema = z.object({
  name: z.string().min(2).max(200),
  contact_email: z.string().email().optional(),
  contact_phone: z.string().max(20).optional(),
});

export const createPartnerOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CreateOrgSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data: row, error } = await supabase
      .from("partner_organizations")
      .insert({
        name: data.name,
        contact_email: data.contact_email ?? null,
        contact_phone: data.contact_phone ?? null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

const AddMemberSchema = z.object({ org_id: z.string().uuid(), email: z.string().email() });

export const addPartnerOrgMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AddMemberSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: userList, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (listErr) throw new Error(listErr.message);
    const match = userList.users.find((u) => u.email?.toLowerCase() === data.email.toLowerCase());
    if (!match)
      throw new Error(
        "Is email se koi account nahi mila — pehle unhe /landlord/login se signup karna hoga.",
      );

    const { error } = await supabase
      .from("partner_org_members")
      .insert({ org_id: data.org_id, user_id: match.id });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
