/**
 * Publishing a listing is independent of document verification.
 * These builders only describe the publish-related columns; they never touch
 * verification_status / verified_at (those reflect real admin decisions).
 */
export type PropertyPublishInput = {
  publish: boolean;
  city?: string;
  address?: string;
  description?: string;
  property_type?: "pg" | "room" | "flat" | "hostel" | "shared";
};

export function buildPropertyPublishPatch(d: PropertyPublishInput) {
  return {
    is_public_listing: d.publish,
    ...(d.city !== undefined ? { myr_city: d.city } : {}),
    ...(d.address !== undefined ? { myr_address: d.address } : {}),
    ...(d.description !== undefined ? { myr_description: d.description } : {}),
    ...(d.property_type !== undefined ? { property_type: d.property_type } : {}),
  };
}

export type RoomPublishInput = {
  publish: boolean;
  amenities?: string[];
  description?: string;
  deposit?: number;
  available?: boolean;
};

export function buildRoomPublishPatch(d: RoomPublishInput) {
  return {
    is_public: d.publish,
    ...(d.amenities ? { myr_amenities: d.amenities } : {}),
    ...(d.description !== undefined ? { myr_description: d.description } : {}),
    ...(d.deposit !== undefined ? { myr_deposit: d.deposit } : {}),
    ...(d.available !== undefined ? { myr_available: d.available } : {}),
  };
}
