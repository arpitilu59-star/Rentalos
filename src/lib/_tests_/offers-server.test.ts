/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
import { describe, it, expect } from "vitest";
import {
  offerError,
  parseAmount,
  rentForAccept,
  getRoomOfferInfo,
  getOwnerOfferSettings,
  saveOwnerOfferSettings,
  tenantOfferView,
  decideOffer,
  respondOffer,
} from "../offers.server";

/** Minimal chainable stub of the supabase client. */
function fake(tables: Record<string, any>, rpcs: Record<string, (a: any) => any> = {}) {
  const upserts: any[] = [];
  const client: any = {
    from: (t: string) => {
      const row = tables[t];
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => ({ data: row ?? null }),
        upsert: async (v: any) => {
          upserts.push({ t, v });
          return { error: null };
        },
      };
      return chain;
    },
    rpc: async (n: string, a: any) => (rpcs[n] ? rpcs[n](a) : { data: null, error: null }),
  };
  return { client, upserts };
}

describe("offerError / parseAmount", () => {
  it("maps database codes to friendly messages and hides unknown errors", () => {
    expect(offerError({ message: "OFFER_TOO_LOW: offers below 50%" }).message).toMatch(/50%/);
    expect(offerError({ message: "OFFER_OPEN: decide the rent offer" }).message).toMatch(
      /decision/,
    );
    expect(offerError({ message: 'relation "x" does not exist' }).message).toBe(
      "Offer process nahi ho paya. Dobara try karein.",
    );
  });
  it("parses whole rupees and rejects junk", () => {
    expect(parseAmount("₹ 8,500")).toBe(8500);
    expect(parseAmount(7999.6)).toBe(8000);
    for (const bad of [0, -5, "abc", "", null, undefined, 1e12])
      expect(parseAmount(bad)).toBeNull();
  });
});

describe("rentForAccept", () => {
  it("uses the agreed rent when present, otherwise the fallback", async () => {
    expect(
      await rentForAccept(
        fake({}, { offer_agreed_rent: () => ({ data: 8500, error: null }) }).client,
        "b",
        10000,
      ),
    ).toBe(8500);
    expect(
      await rentForAccept(
        fake({}, { offer_agreed_rent: () => ({ data: null, error: null }) }).client,
        "b",
        10000,
      ),
    ).toBe(10000);
  });
  it("blocks while an offer is still open", async () => {
    const c = fake(
      {},
      { offer_agreed_rent: () => ({ data: null, error: { message: "OFFER_OPEN: decide" } }) },
    ).client;
    await expect(rentForAccept(c, "b", 10000)).rejects.toThrow(/decision/);
  });
});

describe("tenant-facing data never contains the floor", () => {
  it("getRoomOfferInfo returns only enabled / rent / public minimum", async () => {
    const { client } = fake({
      room_offer_settings: { offers_enabled: true, min_rent: 8000, auto_approve: true },
      rooms: { rent_amount: 10000 },
    });
    const info = await getRoomOfferInfo(client, "r");
    expect(info).toEqual({ enabled: true, rent: 10000, min_allowed: 5000 });
    expect(JSON.stringify(info)).not.toContain("8000");
  });
  it("tenantOfferView exposes only offer amounts and status", () => {
    const v = tenantOfferView({
      offer_status: "countered",
      offered_rent: 7000,
      counter_rent: 8000,
      agreed_rent: null,
      offer_expires_at: "x",
      min_rent: 8000,
      floor: 1,
    });
    expect(Object.keys(v!).sort()).toEqual([
      "agreed_rent",
      "confirmed_at",
      "counter_rent",
      "expires_at",
      "offered_rent",
      "status",
    ]);
    expect(tenantOfferView({ offer_status: null })).toBeNull();
  });
  it("offers off => disabled", async () => {
    expect(
      (
        await getRoomOfferInfo(
          fake({ room_offer_settings: { offers_enabled: false }, rooms: { rent_amount: 10000 } })
            .client,
          "r",
        )
      ).enabled,
    ).toBe(false);
  });
});

describe("owner settings", () => {
  const room = { id: "r", owner_id: "L", rent_amount: 10000 };
  it("only the owner can read or save", async () => {
    await expect(getOwnerOfferSettings(fake({ rooms: room }).client, "OTHER", "r")).rejects.toThrow(
      /permission/,
    );
    await expect(
      saveOwnerOfferSettings(fake({ rooms: room }).client, "OTHER", {
        room_id: "r",
        offers_enabled: true,
        min_rent: 8000,
        auto_approve: false,
      }),
    ).rejects.toThrow(/permission/);
  });
  it("validates the floor", async () => {
    const f = () => fake({ rooms: room }).client;
    await expect(
      saveOwnerOfferSettings(f(), "L", {
        room_id: "r",
        offers_enabled: true,
        min_rent: null,
        auto_approve: false,
      }),
    ).rejects.toThrow(/floor/);
    await expect(
      saveOwnerOfferSettings(f(), "L", {
        room_id: "r",
        offers_enabled: true,
        min_rent: 12000,
        auto_approve: false,
      }),
    ).rejects.toThrow(/zyada/);
    await expect(
      saveOwnerOfferSettings(f(), "L", {
        room_id: "r",
        offers_enabled: true,
        min_rent: "abc",
        auto_approve: false,
      }),
    ).rejects.toThrow(/number/);
  });
  it("saves with the caller as owner and turns auto-approve off when offers are off", async () => {
    const { client, upserts } = fake({ rooms: room });
    await saveOwnerOfferSettings(client, "L", {
      room_id: "r",
      offers_enabled: false,
      min_rent: 8000,
      auto_approve: true,
    });
    expect(upserts[0].v).toMatchObject({
      room_id: "r",
      owner_id: "L",
      offers_enabled: false,
      min_rent: 8000,
      auto_approve: false,
    });
  });
});

describe("actions pass the caller identity, never a client-supplied one", () => {
  it("decideOffer rejects unknown actions and forwards landlord id + counter only for counters", async () => {
    await expect(decideOffer(fake({}).client, "L", "b", "hack")).rejects.toThrow();
    let seen: any;
    const c = fake(
      {},
      { offer_decide: (a) => ((seen = a), { data: { offer_status: "approved" }, error: null }) },
    ).client;
    await decideOffer(c, "L", "b", "approve", 123);
    expect(seen).toEqual({ _booking: "b", _landlord: "L", _action: "approve", _counter: null });
    await decideOffer(c, "L", "b", "counter", "8,000");
    expect(seen._counter).toBe(8000);
  });
  it("respondOffer turns an expired result into an error", async () => {
    const c = fake(
      {},
      { offer_respond: () => ({ data: { offer_status: "expired" }, error: null }) },
    ).client;
    await expect(respondOffer(c, "T", "b", "accept")).rejects.toThrow(/expire/);
    await expect(respondOffer(c, "T", "b", "x")).rejects.toThrow();
  });
});
