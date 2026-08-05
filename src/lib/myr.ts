import { supabase } from "@/integrations/supabase/client";

export type ListingType = "pg" | "room" | "flat" | "hostel" | "shared";
export type ListingStatus = "draft" | "pending_review" | "active" | "rejected" | "paused" | "archived";
export type RoomStatus = "available" | "reserved" | "occupied" | "maintenance";
export type Furnishing = "unfurnished" | "semi" | "full";
export type GenderPref = "any" | "male" | "female";
export type BookingStatus = "reserved" | "confirmed" | "cancelled" | "expired" | "completed";

export const LISTING_TYPE_LABEL: Record<ListingType, string> = {
  pg: "PG",
  room: "Room",
  flat: "Flat",
  hostel: "Hostel",
  shared: "Shared",
};

export const formatINR = (n: number) =>
  "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

export async function publicMediaUrl(path: string | null | undefined): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("myr-listings").createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function uploadListingMedia(landlordId: string, listingId: string, file: File) {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `${landlordId}/${listingId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from("myr-listings").upload(path, file, { upsert: false });
  if (error) throw error;
  const kind = file.type.startsWith("video/") ? "video" : "image";
  const { error: e2 } = await supabase
    .from("myr_listing_media")
    .insert({ listing_id: listingId, storage_path: path, kind });
  if (e2) throw e2;
  return path;
}
