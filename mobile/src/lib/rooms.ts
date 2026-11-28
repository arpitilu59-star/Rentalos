export type RoomRow = {
  id: string;
  room_number: string;
  rent_amount: number;
  occupant_type: string | null;
  room_size: string | null;
  myr_photos: unknown;
  properties: {
    name: string;
    myr_city: string | null;
    city: string | null;
    myr_cover_photos: unknown;
    verification_status: string | null;
    myr_lat?: number | null;
    myr_lng?: number | null;
    latitude?: number | null;
    longitude?: number | null;
  } | null;
};
const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
export const cover = (r: RoomRow) =>
  strArr(r.myr_photos)[0] ?? strArr(r.properties?.myr_cover_photos)[0] ?? null;
export const OCC = [
  ["boys", "Boys"],
  ["girls", "Girls"],
  ["family", "Family"],
] as const;
export const SIZES = [
  ["single_room", "Single room"],
  ["shared_room", "Shared room"],
  ["1rk", "1 RK"],
  ["1bhk", "1 BHK"],
  ["2bhk", "2 BHK"],
  ["3bhk", "3 BHK"],
  ["4bhk_plus", "4+ BHK"],
] as const;
