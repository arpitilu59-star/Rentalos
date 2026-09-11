import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyPartnerOrg = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: membership } = await supabase
      .from("partner_org_members")
      .select("org_id, partner_organizations(id, name, verified)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) return { org: null };
    return {
      org: membership.partner_organizations as unknown as {
        id: string;
        name: string;
        verified: boolean;
      },
    };
  });

const RoomRow = z.object({
  property_external_ref_id: z.string().min(1),
  property_name: z.string().min(1),
  city: z.string().optional(),
  address: z.string().optional(),
  room_external_ref_id: z.string().min(1),
  room_number: z.string().min(1),
  rent_amount: z.number().nonnegative(),
  description: z.string().optional(),
  amenities: z.array(z.string()).optional(),
});

const ImportSchema = z.object({ rows: z.array(RoomRow).min(1).max(500) });

export const bulkImportPartnerListings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => ImportSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: membership } = await supabase
      .from("partner_org_members")
      .select("org_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!membership) throw new Error("Aapka account kisi partner organization se linked nahi hai.");
    const orgId = membership.org_id as string;

    const byProperty = new Map<string, typeof data.rows>();
    for (const row of data.rows) {
      const arr = byProperty.get(row.property_external_ref_id) ?? [];
      arr.push(row);
      byProperty.set(row.property_external_ref_id, arr);
    }

    let propertiesUpserted = 0;
    let roomsUpserted = 0;
    const errors: string[] = [];

    for (const [propExtId, rows] of byProperty) {
      const first = rows[0];
      const { data: prop, error: propErr } = await supabase
        .from("properties")
        .upsert(
          {
            owner_id: userId,
            name: first.property_name,
            city: first.city ?? null,
            address: first.address ?? null,
            source: "partner",
            partner_org_id: orgId,
            external_ref_id: propExtId,
            is_public_listing: true,
            verification_status: "verified",
            property_type: "flat",
          },
          { onConflict: "partner_org_id,external_ref_id" },
        )
        .select("id")
        .single();
      if (propErr || !prop) {
        errors.push(
          `Property "${first.property_name}" (${propExtId}): ${propErr?.message ?? "failed"}`,
        );
        continue;
      }
      propertiesUpserted++;

      for (const row of rows) {
        const { error: roomErr } = await supabase.from("rooms").upsert(
          {
            owner_id: userId,
            property_id: prop.id,
            room_number: row.room_number,
            rent_amount: row.rent_amount,
            myr_description: row.description ?? null,
            myr_amenities: row.amenities ?? [],
            source: "partner",
            partner_org_id: orgId,
            external_ref_id: row.room_external_ref_id,
            is_public: true,
            myr_available: true,
          },
          { onConflict: "partner_org_id,external_ref_id" },
        );
        if (roomErr) {
          errors.push(
            `Room "${row.room_number}" (${row.room_external_ref_id}): ${roomErr.message}`,
          );
          continue;
        }
        roomsUpserted++;
      }
    }

    return { propertiesUpserted, roomsUpserted, errors };
  });
