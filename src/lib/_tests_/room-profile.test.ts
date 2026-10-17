import { describe, it, expect } from "vitest";
import { roomProfileMissing, roomProfileLabel } from "../room-profile";

describe("room profile", () => {
  it("lists what is missing", () => {
    expect(roomProfileMissing({})).toHaveLength(2);
    expect(roomProfileMissing({ occupant_type: "boys" })).toHaveLength(1);
    expect(roomProfileMissing({ occupant_type: "boys", room_size: "2bhk" })).toEqual([]);
    expect(roomProfileMissing({ occupant_type: "pets", room_size: "2bhk" })).toHaveLength(1);
  });
  it("builds a label", () => {
    expect(roomProfileLabel({ occupant_type: "family", room_size: "2bhk" })).toBe("Family · 2 BHK");
    expect(roomProfileLabel({})).toBeNull();
  });
});
