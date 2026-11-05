/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeAdmin, type DB } from "./fake-admin";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const R1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const R2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const T1 = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const P1 = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

let db: DB;
let entitled = true;
vi.mock("../whatsapp/db", () => ({ getAdmin: async () => (globalThis as any).__admin }));
vi.mock("../subscription/entitlements", () => ({
  hasEntitlement: async () => entitled,
  requireEntitlement: async () => {
    if (!entitled) throw new Error("SUBSCRIPTION_REQUIRED");
  },
  getUserEntitlements: async () => ({}),
}));

const L = () => import("../mobile-landlord.server");
const today = new Date().toISOString().slice(0, 10);
const terms = {
  gender: "male",
  visitors: "limited",
  smoking: "not_allowed",
  pets: "not_allowed",
  electricity: "metered",
  notice_period_days: 30,
  lock_in_months: 0,
  deposit_refund_days: 15,
  landlord_responsibilities: ["Water"],
  tenant_responsibilities: ["Clean"],
};

beforeEach(() => {
  entitled = true;
  db = {
    myr_user_roles: [],
    properties: [],
    rooms: [],
    tenants: [],
    bills: [],
    payments: [],
    meter_readings: [],
    profiles: [{ id: ME, upi_id: "me@upi" }],
    live_feed_photos: [],
    deposits: [],
    meter_submissions: [],
  };
  (globalThis as any).__admin = makeAdmin(db, { rpc: { generate_tenant_code: () => "TC-1" } });
});

const completeProperty = (over: any = {}) => ({
  id: P1,
  owner_id: ME,
  name: "Sharma PG",
  city: "Jaipur",
  address: "Plot 4, Jaipur",
  latitude: 26.9,
  longitude: 75.8,
  property_type: "pg",
  myr_description: "Near metro, 5 min walk to college",
  current_terms_version: 1,
  terms_summary: terms,
  ...over,
});
const completeRoom = (over: any = {}) => ({
  id: R1,
  owner_id: ME,
  property_id: P1,
  room_number: "101",
  rent_amount: 6000,
  capacity: 2,
  occupant_type: "boys",
  room_size: "single_room",
  myr_deposit: 6000,
  myr_amenities: ["WiFi"],
  myr_description: "Airy room with attached bath",
  is_public: false,
  properties: completeProperty(),
  ...over,
});

describe("landlord-only gate", () => {
  it("a plain tenant account is not a landlord; role or property ownership makes one", async () => {
    const { isLandlord } = await L();
    const a = (globalThis as any).__admin;
    expect(await isLandlord(a, ME)).toBe(false);
    db.myr_user_roles.push({ user_id: ME, role: "landlord" });
    expect(await isLandlord(a, ME)).toBe(true);
    db.myr_user_roles.length = 0;
    db.properties.push({ id: P1, owner_id: OTHER });
    expect(await isLandlord(a, ME)).toBe(false);
    db.properties.push({ id: "x", owner_id: ME });
    expect(await isLandlord(a, ME)).toBe(true);
  });
});

describe("listing cannot be published incomplete", () => {
  it("lists every missing item and refuses to publish", async () => {
    const { publishListing, listingChecklist } = await L();
    db.rooms.push(
      completeRoom({
        myr_description: "",
        myr_amenities: [],
        myr_deposit: null,
        properties: completeProperty({
          current_terms_version: null,
          terms_summary: {},
          latitude: null,
        }),
      }),
    );
    const c = await listingChecklist(ME, R1);
    expect(c.ready).toBe(false);
    expect(c.items.filter((i) => !i.done).map((i) => i.key)).toEqual(
      expect.arrayContaining(["p_geo", "r_dep", "r_amen", "r_desc", "terms", "photos"]),
    );
    await expect(publishListing(ME, { room_id: R1, publish: true })).rejects.toThrow(/baaki hai/);
    expect(db.rooms[0].is_public).toBe(false);
  });

  it("publishes only when everything incl. terms, UPI and a verified live photo exists", async () => {
    const { publishListing } = await L();
    db.rooms.push(completeRoom());
    db.properties.push(completeProperty());
    db.live_feed_photos.push({ owner_id: ME, room_id: R1, verification_status: "flagged" });
    await expect(publishListing(ME, { room_id: R1, publish: true })).rejects.toThrow(/Live photo/);
    db.live_feed_photos.push({ owner_id: ME, room_id: R1, verification_status: "verified" });
    await expect(publishListing(ME, { room_id: R1, publish: true })).resolves.toMatchObject({
      published: true,
    });
    expect(db.rooms[0].is_public).toBe(true);
  });

  it("photos are not demanded on a plan without live photos", async () => {
    const { listingChecklist } = await L();
    entitled = false;
    db.rooms.push(completeRoom());
    const c = await listingChecklist(ME, R1);
    expect(c.items.find((i) => i.key === "photos")).toBeUndefined();
  });

  it("another landlord's room is invisible", async () => {
    const { publishListing } = await L();
    db.rooms.push(completeRoom({ owner_id: OTHER }));
    await expect(publishListing(ME, { room_id: R1, publish: true })).rejects.toThrow(/not found/i);
  });
});

describe("tenants and move-out", () => {
  it("refuses a full room, on add and on reassignment", async () => {
    const { saveTenant } = await L();
    db.rooms.push(
      completeRoom({ capacity: 1 }),
      completeRoom({ id: R2, room_number: "102", capacity: 1 }),
    );
    db.tenants.push(
      { id: "t-x", owner_id: ME, room_id: R1, active: true },
      { id: T1, owner_id: ME, room_id: R2, active: true },
    );
    await expect(
      saveTenant(ME, { name: "Ravi", phone: "9876543210", room_id: R1 }),
    ).rejects.toThrow(/full/);
    await expect(
      saveTenant(ME, { id: T1, name: "Ravi", phone: "9876543210", room_id: R1 }),
    ).rejects.toThrow(/full/);
  });

  it("move-out is blocked with unpaid bills unless explicitly confirmed, and never with unverified payments", async () => {
    const { moveOut, moveOutCheck } = await L();
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, name: "Ravi", active: true });
    db.bills.push({
      id: "b1",
      tenant_id: T1,
      owner_id: ME,
      total_amount: 7000,
      amount_paid: 2000,
      status: "partial",
    });
    expect(await moveOutCheck(ME, { id: T1 })).toMatchObject({ unpaidBills: 1, due: 5000 });
    await expect(moveOut(ME, { id: T1 })).rejects.toThrow(/UNPAID/);
    db.payments.push({ id: "p1", owner_id: ME, bill_id: "b1", verification_status: "submitted" });
    await expect(moveOut(ME, { id: T1, force_unpaid: true })).rejects.toThrow(/verify/);
    db.payments[0].verification_status = "verified";
    await expect(moveOut(ME, { id: T1, force_unpaid: true })).resolves.toMatchObject({
      ok: true,
      due: 5000,
    });
    expect(db.tenants[0].active).toBe(false);
    await expect(moveOut(ME, { id: T1, force_unpaid: true })).rejects.toThrow(/pehle hi/);
  });

  it("cannot touch another landlord's tenant", async () => {
    const { moveOut } = await L();
    db.tenants.push({ id: T1, owner_id: OTHER, room_id: R1, name: "Ravi", active: true });
    await expect(moveOut(ME, { id: T1 })).rejects.toThrow(/not found/i);
  });
});

describe("bills are computed on the server", () => {
  const body = (over: any = {}) => ({
    tenant_id: T1,
    rent_period_start: "2026-11-01",
    rent_period_end: "2026-12-01",
    elec_period_start: "2026-10-01",
    elec_period_end: "2026-11-01",
    due_date: "2026-11-06",
    rent_amount: 6000,
    prev_reading: 100,
    curr_reading: 150,
    electricity_per_unit: 10,
    persons: 2,
    water_per_person: 100,
    cleaning_amount: 250,
    other_charges: 0,
    previous_dues: 500,
    total_amount: 1,
    ...over,
  });
  it("ignores a client-supplied total and refuses duplicates for the same rent period", async () => {
    const { createBill } = await L();
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, active: true });
    const r = await createBill(ME, body());
    expect(r.total).toBe(6000 + 500 + 200 + 250 + 500);
    expect(db.bills[0].total_amount).toBe(7450);
    await expect(createBill(ME, body())).rejects.toThrow(/pehle se/);
  });
  it("rejects a current reading below the previous one", async () => {
    const { createBill } = await L();
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, active: true });
    await expect(createBill(ME, body({ curr_reading: 90 }))).rejects.toThrow(/kam nahi/);
  });
});

describe("meter entry is validated on the server", () => {
  const seed = () => {
    db.rooms.push(completeRoom());
    db.meter_readings.push(
      { id: "m1", owner_id: ME, room_id: R1, reading: 1000, reading_date: "2026-09-20" },
      { id: "m0", owner_id: ME, room_id: R1, reading: 900, reading_date: "2026-08-20" },
    );
  };
  it("accepts a normal decimal reading and stores it", async () => {
    const { addMeterReading } = await L();
    seed();
    const r = await addMeterReading(ME, { room_id: R1, reading: "1110.6", date: today });
    expect(r.usage).toBeCloseTo(110.6);
    expect(db.meter_readings.at(-1)!.reading).toBeCloseTo(1110.6);
  });
  it("never silently accepts a lower reading — a reason is mandatory and recorded", async () => {
    const { addMeterReading } = await L();
    seed();
    await expect(addMeterReading(ME, { room_id: R1, reading: "950", date: today })).rejects.toThrow(
      /wajah/,
    );
    expect(db.meter_readings).toHaveLength(2);
    await addMeterReading(ME, {
      room_id: R1,
      reading: "950",
      date: today,
      reason: "Meter replaced by DISCOM",
    });
    expect(db.meter_readings.at(-1)!.notes).toMatch(/Exception/);
  });
  it("rejects comma formats, duplicate dates, future dates and another landlord's room", async () => {
    const { addMeterReading } = await L();
    seed();
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "1,110", date: today }),
    ).rejects.toThrow(/Comma/);
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "1100", date: "2026-09-20" }),
    ).rejects.toThrow(/pehle se/);
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "1100", date: "2999-01-01" }),
    ).rejects.toThrow(/future/);
    db.rooms[0].owner_id = OTHER;
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "1100", date: today }),
    ).rejects.toThrow(/not found/i);
  });
  it("a suspicious jump needs explicit confirmation", async () => {
    const { addMeterReading } = await L();
    seed();
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "5000", date: today }),
    ).rejects.toThrow(/confirm/);
    await expect(
      addMeterReading(ME, { room_id: R1, reading: "5000", date: today, confirm_high: true }),
    ).resolves.toMatchObject({ ok: true });
  });
  it("a photo path from another user is refused", async () => {
    const { addMeterReading } = await L();
    seed();
    await expect(
      addMeterReading(ME, {
        room_id: R1,
        reading: "1100",
        date: today,
        photo_path: `${OTHER}/x.jpg`,
      }),
    ).rejects.toThrow(/photo/i);
  });
});

describe("payments", () => {
  it("verify is idempotent-safe: a verified payment cannot be applied twice, other owners are forbidden", async () => {
    const { decidePayment } = await L();
    db.bills.push({
      id: "b1",
      owner_id: ME,
      total_amount: 5000,
      amount_paid: 0,
      status: "pending",
    });
    db.payments.push({
      id: "00000000-0000-4000-8000-000000000001",
      owner_id: ME,
      bill_id: "b1",
      amount: 5000,
      verification_status: "submitted",
    });
    await expect(
      decidePayment(OTHER, {
        payment_id: "00000000-0000-4000-8000-000000000001",
        decision: "verify",
      }),
    ).rejects.toThrow(/Forbidden/);
    await expect(
      decidePayment(ME, { payment_id: "00000000-0000-4000-8000-000000000001", decision: "verify" }),
    ).resolves.toMatchObject({ status: "paid" });
    expect(db.bills[0].amount_paid).toBe(5000);
    await expect(
      decidePayment(ME, { payment_id: "00000000-0000-4000-8000-000000000001", decision: "verify" }),
    ).rejects.toThrow(/pehle hi/);
    expect(db.bills[0].amount_paid).toBe(5000);
  });
  it("is refused without the payment_verification entitlement", async () => {
    const { decidePayment } = await L();
    entitled = false;
    await expect(
      decidePayment(ME, { payment_id: "00000000-0000-4000-8000-000000000001", decision: "verify" }),
    ).rejects.toThrow(/SUBSCRIPTION/);
  });
});

describe("deposits", () => {
  it("settles once, caps deductions and requires a reason", async () => {
    const { createDeposit, settleDeposit } = await L();
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, active: true });
    await createDeposit(ME, { tenant_id: T1, amount_held: 6000 });
    await expect(createDeposit(ME, { tenant_id: T1, amount_held: 6000 })).rejects.toThrow(
      /pehle se/,
    );
    const id = db.deposits[0].id;
    await expect(
      settleDeposit(ME, { id, amount_deducted: 7000, deduction_reason: "x" }),
    ).rejects.toThrow(/zyada/);
    await expect(settleDeposit(ME, { id, amount_deducted: 1000 })).rejects.toThrow(/wajah/);
    await expect(
      settleDeposit(ME, { id, amount_deducted: 1000, deduction_reason: "Wall damage" }),
    ).resolves.toMatchObject({ refunded: 5000, status: "partial_refunded" });
    await expect(settleDeposit(ME, { id, amount_deducted: 0 })).rejects.toThrow(/pehle hi/);
  });
});

describe("bill PDF + manual WhatsApp", () => {
  const bill = (over: any = {}) => ({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    owner_id: ME,
    room_id: R1,
    tenant_id: T1,
    rent_period_start: "2026-10-01",
    rent_period_end: "2026-10-31",
    rent_amount: 6000,
    elec_period_start: null,
    elec_period_end: null,
    prev_reading: 100,
    curr_reading: 140,
    units_consumed: 40,
    electricity_amount: 400,
    persons: 1,
    water_amount: 100,
    cleaning_amount: 50,
    other_charges: 0,
    previous_dues: 0,
    total_amount: 6550,
    amount_paid: 0,
    due_date: "2026-11-05",
    status: "pending",
    tenants: { name: "Ravi", phone: "98765 43210" },
    rooms: { room_number: "101" },
    ...over,
  });
  it("builds a real PDF and a wa.me link with +91 and the bill text", async () => {
    const { billPdf } = await L();
    db.bills.push(bill());
    const r: any = await billPdf(ME, { bill_id: db.bills[0].id });
    expect(r.pdf_url).toBe("https://signed");
    expect(r.whatsapp_url).toMatch(/^https:\/\/wa\.me\/919876543210\?text=/);
    expect(decodeURIComponent(r.whatsapp_url)).toContain("Total: ₹6,550");
    expect(decodeURIComponent(r.whatsapp_url)).toContain("Bill PDF: https://signed");
  });
  it("refuses another landlord's bill and a bad phone number", async () => {
    const { billPdf, billWhatsApp, waDigits } = await L();
    db.bills.push(bill());
    await expect(billPdf(OTHER, { bill_id: db.bills[0].id })).rejects.toThrow(/not found/);
    db.bills[0].tenants = { name: "Ravi", phone: "123" };
    await expect(billWhatsApp(ME, { bill_id: db.bills[0].id })).rejects.toThrow(/phone/);
    expect(waDigits("+91 98765-43210")).toBe("919876543210");
    expect(waDigits("09876543210")).toBe("919876543210");
  });
});

describe("bill actions, statement, partner import", () => {
  const B = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
  const mk = (o: any = {}) => ({
    id: B,
    owner_id: ME,
    tenant_id: T1,
    total_amount: 1000,
    amount_paid: 0,
    status: "pending",
    rent_period_start: "2026-10-01",
    ...o,
  });
  it("caps partial payment at the balance and refuses double 'paid'", async () => {
    const { markPaid } = await L();
    db.bills.push(mk());
    await expect(markPaid(ME, { bill_id: B, amount: 1500 })).rejects.toThrow(/zyada/);
    await expect(markPaid(ME, { bill_id: B, amount: 400 })).resolves.toMatchObject({
      status: "partial",
    });
    await expect(markPaid(ME, { bill_id: B, amount: 600 })).resolves.toMatchObject({
      status: "paid",
    });
    await expect(markPaid(ME, { bill_id: B, amount: 1 })).rejects.toThrow(/pehle hi/);
  });
  it("deletes only untouched bills of the owner", async () => {
    const { billDelete } = await L();
    db.bills.push(mk({ amount_paid: 200 }));
    await expect(billDelete(ME, { bill_id: B })).rejects.toThrow(/payment/);
    db.bills[0].amount_paid = 0;
    await expect(billDelete(OTHER, { bill_id: B })).rejects.toThrow(/not found/);
    await expect(billDelete(ME, { bill_id: B })).resolves.toEqual({ ok: true });
    expect(db.bills).toHaveLength(0);
  });
  it("validates the reminder-pause date", async () => {
    const { billPauseReminders } = await L();
    db.bills.push(mk());
    await expect(billPauseReminders(ME, { bill_id: B, until: "2020-01-01" })).rejects.toThrow(
      /aage/,
    );
    await expect(billPauseReminders(ME, { bill_id: B, until: "bad" })).rejects.toThrow(/YYYY/);
    await billPauseReminders(ME, { bill_id: B, until: "2099-01-01" });
    expect(db.bills[0].reminders_paused_until).toBe("2099-01-01");
  });
  it("totals a tenant statement", async () => {
    const { tenantStatement } = await L();
    db.tenants.push({ id: T1, owner_id: ME, name: "Ravi", active: true });
    db.bills.push(mk({ amount_paid: 300 }));
    await expect(tenantStatement(ME, { tenant_id: T1 })).resolves.toMatchObject({
      billed: 1000,
      paid: 300,
      due: 700,
    });
  });
  it("partner import is blocked without the entitlement and validates rows", async () => {
    const { partnerImport } = await L();
    const csv =
      "property_external_ref_id,property_name,room_external_ref_id,room_number,rent_amount\nA,Blk,A1,101,8500\nA,Blk,,102,x";
    entitled = false;
    await expect(partnerImport(ME, { csv })).rejects.toThrow(/SUBSCRIPTION/);
    entitled = true;
    db.partner_org_members = [{ user_id: ME, org_id: "o1" }];
    await expect(partnerImport(ME, { csv, dry_run: true })).resolves.toMatchObject({
      valid_rows: 1,
    });
  });
});

describe("gender fit, parking honesty, meter location", () => {
  it("refuses a female tenant in a Boys room and accepts a male one; asks for gender", async () => {
    const { saveTenant } = await L();
    db.rooms.push(completeRoom({ capacity: 3 }));
    const base = { name: "Asha", phone: "9876543210", room_id: R1 };
    await expect(saveTenant(ME, { ...base, gender: "female" })).rejects.toThrow(/Boys room/);
    await expect(saveTenant(ME, base)).rejects.toThrow(/Boys room/);
    await expect(saveTenant(ME, { ...base, gender: "male" })).resolves.toHaveProperty("id");
    expect(db.tenants[0].gender).toBe("male");
  });
  it("applies the same rule when moving a tenant into a Girls room", async () => {
    const { saveTenant } = await L();
    db.rooms.push(
      completeRoom({ capacity: 3 }),
      completeRoom({ id: R2, room_number: "102", occupant_type: "girls", capacity: 3 }),
    );
    db.tenants.push({
      id: T1,
      owner_id: ME,
      room_id: R1,
      name: "Ravi",
      active: true,
      gender: "male",
    });
    await expect(
      saveTenant(ME, { id: T1, name: "Ravi", phone: "9876543210", room_id: R2 }),
    ).rejects.toThrow(/Girls room/);
  });
  it("never records street/nearby parking as landlord-owned", async () => {
    const { parkingFields } = await L();
    const street = parkingFields({
      parking_kind: "street",
      parking_covered: true,
      parking_reserved: true,
    });
    expect(street.parking_covered).toBeNull();
    expect(street.parking_reserved).toBeNull();
    expect(
      parkingFields({ parking_kind: "none", parking_vehicle: "both", parking_paid: true }),
    ).toMatchObject({
      parking_vehicle: null,
      parking_paid: null,
    });
    expect(() => parkingFields({ parking_kind: "nearby" })).toThrow(/doori/);
    expect(
      parkingFields({ parking_kind: "dedicated", parking_covered: true }).parking_covered,
    ).toBe(true);
  });
  it("stores meter photo location only with a photo and valid coordinates", async () => {
    const { addMeterReading } = await L();
    db.rooms.push(completeRoom());
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, active: true });
    await addMeterReading(ME, {
      room_id: R1,
      reading: "10.5",
      date: today,
      photo_path: `${ME}/x.jpg`,
      photo_lat: 26.9,
      photo_lng: 75.8,
    });
    expect(db.meter_readings[0]).toMatchObject({ photo_lat: 26.9, photo_lng: 75.8 });
    expect(db.meter_readings[0]).not.toBeUndefined();
  });
});

describe("meter analysis, KYC submit, inquiries", () => {
  it("detects rollback, stuck and spike months", async () => {
    const { analyseMeter } = await import("../meter-analysis");
    const r = analyseMeter([
      { reading: 100, reading_date: "2026-01-05" },
      { reading: 150, reading_date: "2026-02-05" },
      { reading: 200, reading_date: "2026-03-05" },
      { reading: 190, reading_date: "2026-04-05" },
      { reading: 190, reading_date: "2026-05-05" },
      { reading: 600, reading_date: "2026-06-05" },
    ]);
    expect(r.months_tracked).toBe(5);
    expect(r.anomalies.map((x) => x.type)).toEqual(["rollback", "stuck", "spike"]);
    expect(analyseMeter([{ reading: 5, reading_date: "2026-01-01" }]).anomalies).toEqual([]);
  });
  it("kycSubmit only accepts own-folder image paths and always stays pending", async () => {
    const { kycSubmit } = await L();
    db.myr_verifications = [];
    const good = `${ME}/landlord-id_doc_path-12345678-aaaa.jpg`;
    await expect(
      kycSubmit(ME, {
        field: "id_doc_path",
        path: `${OTHER}/landlord-id_doc_path-12345678-aaaa.jpg`,
      }),
    ).rejects.toThrow(/path/);
    await expect(kycSubmit(ME, { field: "id_doc_path", path: `${ME}/../x.jpg` })).rejects.toThrow(
      /path/,
    );
    await expect(kycSubmit(ME, { field: "selfie_path", path: good })).rejects.toThrow(/path/);
    await expect(kycSubmit(ME, { field: "status", path: good })).rejects.toThrow(/Invalid/);
    await expect(kycSubmit(ME, { field: "id_doc_path", path: good })).resolves.toMatchObject({
      mode: "created",
    });
    expect(db.myr_verifications[0].status).toBe("pending");
    await expect(
      kycSubmit(ME, { field: "selfie_path", path: `${ME}/landlord-selfie_path-12345678-bbbb.png` }),
    ).resolves.toMatchObject({ mode: "updated" });
    expect(db.myr_verifications).toHaveLength(1);
  });
  it("a landlord can only read and reply in their own inquiry", async () => {
    const { inquiryMessages, inquirySend } = await L();
    const I1 = "99999999-9999-4999-8999-999999999999";
    db.myr_inquiries = [{ id: I1, landlord_id: ME, tenant_id: OTHER, last_message: null }];
    db.myr_inquiry_messages = [];
    await expect(inquirySend(OTHER, { id: I1, body: "hi" })).rejects.toThrow(/not found/);
    await expect(inquirySend(ME, { id: I1, body: "  " })).rejects.toThrow(/likhein/);
    await inquirySend(ME, { id: I1, body: "Room available hai" });
    const r: any = await inquiryMessages(ME, { id: I1 });
    expect(r.messages[0]).toMatchObject({ body: "Room available hai", mine: true });
    expect(db.myr_inquiries[0].last_message).toBe("Room available hai");
  });
});

describe("profile details, reminders, reports", () => {
  it("saves address/city/bank details and rejects a short phone", async () => {
    const { saveProfile } = await L();
    await saveProfile(ME, {
      address: "12 MG Road",
      city: "Jaipur",
      bank_details: "HDFC 1234 IFSC HDFC0001",
    });
    expect(db.profiles[0]).toMatchObject({ city: "Jaipur", address: "12 MG Road" });
    await expect(saveProfile(ME, { phone: "123" })).rejects.toThrow(/10 digit/);
  });
  it("reminder only for unpaid bills, receipt only after a payment", async () => {
    const { billWhatsApp } = await L();
    const base = {
      id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
      owner_id: ME,
      rent_amount: 6000,
      electricity_amount: 0,
      units_consumed: 0,
      water_amount: 0,
      cleaning_amount: 0,
      total_amount: 6000,
      amount_paid: 0,
      status: "pending",
      due_date: "2026-11-05",
      rent_period_start: "2026-10-01",
      rent_period_end: "2026-10-31",
      tenants: { name: "Ravi", phone: "9876543210" },
      rooms: { room_number: "101" },
    };
    db.bills.push({ ...base });
    const rem: any = await billWhatsApp(ME, { bill_id: base.id, kind: "reminder" });
    expect(decodeURIComponent(rem.whatsapp_url)).toContain("Rent reminder");
    await expect(billWhatsApp(ME, { bill_id: base.id, kind: "receipt" })).rejects.toThrow(
      /receipt/,
    );
    db.bills[0].amount_paid = 6000;
    db.bills[0].status = "paid";
    const rec: any = await billWhatsApp(ME, { bill_id: base.id, kind: "receipt" });
    expect(decodeURIComponent(rec.whatsapp_url)).toContain("Pura bhugtan");
    await expect(billWhatsApp(ME, { bill_id: base.id, kind: "reminder" })).rejects.toThrow(/paid/);
  });
  it("reports totals only verified payments and lists dues", async () => {
    const { reports } = await L();
    const ym = new Date().toISOString().slice(0, 7);
    db.bills.push({
      id: "b1",
      owner_id: ME,
      tenant_id: T1,
      total_amount: 5000,
      amount_paid: 2000,
      status: "partial",
      due_date: "2020-01-01",
      rent_period_start: `${ym}-01`,
      tenants: { name: "Ravi" },
      rooms: { room_number: "101" },
    });
    db.payments.push(
      {
        amount: 2000,
        paid_on: `${ym}-03`,
        created_at: `${ym}-03`,
        verification_status: "verified",
        owner_id: ME,
      },
      {
        amount: 999,
        paid_on: `${ym}-04`,
        created_at: `${ym}-04`,
        verification_status: "pending",
        owner_id: ME,
      },
    );
    const r: any = await reports(ME);
    expect(r.months).toHaveLength(6);
    expect(r.total_collected).toBe(2000);
    expect(r.top_dues[0]).toMatchObject({ name: "Ravi", due: 3000, overdue: true });
  });
});

describe("live room video + expenses", () => {
  const vpath = `${ME}/room-1700000000.mp4`;
  const setup = () => {
    db.rooms.push(completeRoom());
    db.properties.push(completeProperty());
    db.live_feed_videos = [];
  };
  it("registers a video as pending, flags a far-away one, never verifies", async () => {
    const { addVideo } = await L();
    setup();
    (db.rooms[0] as any).properties = { latitude: 26.9, longitude: 75.8 };
    const ok: any = await addVideo(ME, {
      room_id: R1,
      storage_path: vpath,
      duration_seconds: 20,
      lat: 26.9,
      lng: 75.8,
    });
    expect(ok.verification_status).toBe("pending");
    const far: any = await addVideo(ME, {
      room_id: R1,
      storage_path: `${ME}/room-1700000001.mp4`,
      duration_seconds: 20,
      lat: 27.5,
      lng: 76.5,
    });
    expect(far.verification_status).toBe("flagged");
  });
  it("rejects bad duration, foreign path, missing location, and no entitlement", async () => {
    const { addVideo } = await L();
    setup();
    const base = { room_id: R1, storage_path: vpath, duration_seconds: 20, lat: 26.9, lng: 75.8 };
    await expect(addVideo(ME, { ...base, duration_seconds: 3 })).rejects.toThrow(/5 se 45/);
    await expect(addVideo(ME, { ...base, duration_seconds: 60 })).rejects.toThrow(/5 se 45/);
    await expect(
      addVideo(ME, { ...base, storage_path: `${OTHER}/room-1700000000.mp4` }),
    ).rejects.toThrow(/path/);
    await expect(addVideo(ME, { ...base, storage_path: `${ME}/../x.mp4` })).rejects.toThrow(/path/);
    await expect(addVideo(ME, { ...base, lat: undefined })).rejects.toThrow(/location/);
    await expect(addVideo(OTHER, base)).rejects.toThrow(/not found/);
    entitled = false;
    await expect(addVideo(ME, base)).rejects.toThrow(/SUBSCRIPTION/);
  });
  it("expenses: validates, totals by category, refuses other owners", async () => {
    const { addExpense, listExpenses, deleteExpense } = await L();
    db.expenses = [];
    await expect(addExpense(ME, { category: "x", amount: 10 })).rejects.toThrow(/Category/);
    await expect(addExpense(ME, { category: "repair", amount: 0 })).rejects.toThrow(/Amount/);
    await expect(
      addExpense(ME, { category: "repair", amount: 10, spent_on: "2999-01-01" }),
    ).rejects.toThrow(/Aage/);
    await addExpense(ME, { category: "repair", amount: 500, spent_on: today });
    await addExpense(ME, { category: "repair", amount: 250, spent_on: today });
    await addExpense(ME, { category: "salary", amount: 1000, spent_on: today });
    const r: any = await listExpenses(ME, {});
    expect(r.total).toBe(1750);
    expect(r.by_category).toEqual({ repair: 750, salary: 1000 });
    await expect(deleteExpense(OTHER, { id: db.expenses[0].id })).rejects.toThrow(/not found/);
    await expect(deleteExpense(ME, { id: db.expenses[0].id })).resolves.toEqual({ ok: true });
  });
});

describe("receipt email + tenant verification requests", () => {
  const bill = () => ({
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    owner_id: ME,
    total_amount: 1000,
    amount_paid: 0,
    status: "pending",
    tenants: { name: "Ravi", email: "ravi@example.com" },
    rooms: { room_number: "101" },
  });
  it("sends a receipt only when fully paid, reports no_email / not_configured honestly", async () => {
    const { markPaid } = await L();
    const calls: any[] = [];
    vi.stubGlobal("fetch", async (u: string, o: any) => {
      calls.push([u, o]);
      return { ok: true };
    });
    db.bills.push(bill());
    process.env.RESEND_API_KEY = "re_test";
    const part: any = await markPaid(ME, { bill_id: db.bills[0].id, amount: 400 });
    expect(part).toMatchObject({ status: "partial", receipt: "not_needed" });
    expect(calls).toHaveLength(0);
    const full: any = await markPaid(ME, { bill_id: db.bills[0].id });
    expect(full).toMatchObject({ status: "paid", receipt: "sent" });
    expect(calls[0][0]).toContain("resend.com");
    expect(JSON.parse(calls[0][1].body).to).toEqual(["ravi@example.com"]);
    db.bills.push({
      ...bill(),
      id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      tenants: { name: "A", email: null },
    });
    expect(
      (await markPaid(ME, { bill_id: "ffffffff-ffff-4fff-8fff-ffffffffffff" })) as any,
    ).toMatchObject({ receipt: "no_email" });
    delete process.env.RESEND_API_KEY;
    db.bills.push({ ...bill(), id: "dddddddd-aaaa-4aaa-8aaa-dddddddddddd" });
    expect(
      (await markPaid(ME, { bill_id: "dddddddd-aaaa-4aaa-8aaa-dddddddddddd" })) as any,
    ).toMatchObject({ receipt: "not_configured" });
    vi.unstubAllGlobals();
  });
  it("tenant verification: own tenant only, own-folder docs, known types, no duplicates", async () => {
    const { createOwnVerification } = await L();
    db.verifications = [];
    db.verification_documents = [];
    db.tenants.push({ id: T1, owner_id: ME, room_id: R1, active: true });
    const doc = { doc_type: "aadhaar", storage_path: `${ME}/1700-a.jpg` };
    const base = { kind: "tenant", tenant_id: T1, documents: [doc] };
    await expect(createOwnVerification(ME, { ...base, documents: [] })).rejects.toThrow(/document/);
    await expect(
      createOwnVerification(ME, { ...base, documents: [{ ...doc, doc_type: "x" }] }),
    ).rejects.toThrow(/type/);
    await expect(
      createOwnVerification(ME, {
        ...base,
        documents: [{ ...doc, storage_path: `${OTHER}/a.jpg` }],
      }),
    ).rejects.toThrow(/path/);
    await expect(createOwnVerification(OTHER, base)).rejects.toThrow(/not found/);
    await expect(createOwnVerification(ME, base)).resolves.toHaveProperty("id");
    expect(db.verification_documents).toHaveLength(1);
    db.verifications[0].status = "pending";
    await expect(createOwnVerification(ME, base)).rejects.toThrow(/review mein/);
  });
});
