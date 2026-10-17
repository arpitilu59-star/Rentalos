/** Who will live in a room and how big it is — required before a room can be published. */
export const OCCUPANT_TYPES = ["boys", "girls", "family", "anyone"] as const;
export type OccupantType = (typeof OCCUPANT_TYPES)[number];
export const OCCUPANT_LABEL: Record<OccupantType, string> = {
  boys: "Boys only",
  girls: "Girls only",
  family: "Family",
  anyone: "Anyone",
};

export const ROOM_SIZES = ["single_room", "shared_room", "1rk", "1bhk", "2bhk", "3bhk", "4bhk_plus"] as const;
export type RoomSize = (typeof ROOM_SIZES)[number];
export const ROOM_SIZE_LABEL: Record<RoomSize, string> = {
  single_room: "Single room",
  shared_room: "Shared room",
  "1rk": "1 RK",
  "1bhk": "1 BHK",
  "2bhk": "2 BHK",
  "3bhk": "3 BHK",
  "4bhk_plus": "4+ BHK",
};

export const isOccupantType = (v: unknown): v is OccupantType =>
  typeof v === "string" && (OCCUPANT_TYPES as readonly string[]).includes(v);
export const isRoomSize = (v: unknown): v is RoomSize =>
  typeof v === "string" && (ROOM_SIZES as readonly string[]).includes(v);

/** Returns what's still missing before the room can go live (empty = ready). */
export function roomProfileMissing(r: { occupant_type?: string | null; room_size?: string | null }): string[] {
  const out: string[] = [];
  if (!isOccupantType(r.occupant_type)) out.push("who will live here (boys / girls / family)");
  if (!isRoomSize(r.room_size)) out.push("room size (1 RK, 1 BHK, 2 BHK…)");
  return out;
}

export function roomProfileLabel(r: { occupant_type?: string | null; room_size?: string | null }): string | null {
  const parts = [
    isOccupantType(r.occupant_type) ? OCCUPANT_LABEL[r.occupant_type] : null,
    isRoomSize(r.room_size) ? ROOM_SIZE_LABEL[r.room_size] : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
