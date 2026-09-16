import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/**
 * Public, unauthenticated read of a single marketplace room — used by
 * the room route's loader so listing metadata (title/description/
 * canonical/JSON-LD) is rendered server-side where crawlers can see it.
 * The page previously fetched only in a client useEffect, which meant
 * every listing shipped identical, generic metadata.
 *
 * Uses the anon/publishable key deliberately (NOT service-role), so the
 * existing RLS policy "MYR public rooms browse" is what decides
 * visibility — only rooms that are genuinely public on a verified,
 * publicly-listed property can be read. No private landlord or tenant
 * data is selected here.
 */
export const getPublicRoom = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const supabasePublic = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: row } = await supabasePublic
      .from("rooms")
      .select(
        "id, room_number, rent_amount, myr_amenities, myr_description, myr_deposit, properties!inner(name, myr_city, city, myr_address, address, property_type, is_public_listing, verification_status)",
      )
      .eq("id", data.id)
      .eq("is_public", true)
      .maybeSingle();

    if (!row) return { room: null };

    const p = row.properties as unknown as {
      name: string;
      myr_city: string | null;
      city: string | null;
      myr_address: string | null;
      address: string | null;
      property_type: string | null;
      verification_status: string | null;
    };

    return {
      room: {
        id: row.id as string,
        room_number: row.room_number as string,
        rent_amount: Number(row.rent_amount),
        deposit: row.myr_deposit != null ? Number(row.myr_deposit) : null,
        description: (row.myr_description as string | null) ?? null,
        amenities: (row.myr_amenities as string[] | null) ?? [],
        propertyName: p.name,
        city: p.myr_city || p.city || null,
        locality: p.myr_address || p.address || null,
        propertyType: p.property_type || null,
        verified: p.verification_status === "verified",
      },
    };
  });
