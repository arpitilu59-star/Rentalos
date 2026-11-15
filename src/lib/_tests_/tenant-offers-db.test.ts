/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real migration SQL against in-memory Postgres (PGlite). Not a live Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const L = "00000000-0000-0000-0000-0000000000b1";
const L2 = "00000000-0000-0000-0000-0000000000b2";
const T = "00000000-0000-0000-0000-0000000000c1";
const T2 = "00000000-0000-0000-0000-0000000000c2";
let db: PGlite;
let prop: string, room: string, room2: string;
const q = async (s: string) => (await db.query<any>(s)).rows;
const pg = async () => {
  await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE;");
};
const as = async (role: string, uid: string | null) => {
  await pg();
  await db.exec(
    `select set_config('request.jwt.claim.role','${role}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false);`,
  );
  await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE ${role};`);
};
const fails = async (fn: () => Promise<unknown>, re: RegExp) => {
  let msg = "";
  try {
    await fn();
  } catch (e) {
    msg = (e as Error).message;
  }
  expect(msg).toMatch(re);
};
const svc = async (sql: string) => {
  await as("service_role", null);
  return q(sql);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE TABLE public.notes_log (uid uuid, kind text, body text);
    CREATE FUNCTION public.notify_user(u uuid, k text, t text, b text, l text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.notes_log VALUES (u,k,b) $$;
    CREATE TABLE public.properties (id uuid primary key default gen_random_uuid(), owner_id uuid not null);
    CREATE TABLE public.rooms (id uuid primary key default gen_random_uuid(), owner_id uuid, property_id uuid, room_number text, rent_amount numeric);
    CREATE TABLE public.bookings (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id uuid, property_id uuid, landlord_id uuid, tenant_user_id uuid,
      tenant_name text, tenant_mobile text, status text NOT NULL DEFAULT 'pending', decided_at timestamptz, tenant_id uuid,
      created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    CREATE POLICY x ON public.bookings USING (true); ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
  `);
  // permissive test policy above stands in for the real tenant/landlord policies; the trigger is what we test.
  await db.exec(mig("20261115000000_tenant_offers.sql"));
  prop = (await q(`insert into properties (owner_id) values ('${L}') returning id`))[0].id;
  room = (await q(`insert into rooms (owner_id,property_id,room_number,rent_amount) values ('${L}','${prop}','101',10000) returning id`))[0].id;
  room2 = (await q(`insert into rooms (owner_id,property_id,room_number,rent_amount) values ('${L}','${prop}','102',10000) returning id`))[0].id;
  await db.exec(`insert into room_offer_settings (room_id, owner_id, offers_enabled, min_rent, auto_approve) values ('${room}','${L}',true,8000,false)`);
});

const mk = async (user = T, r = room) =>
  (await q(
    `insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_name) values ('${L}','${prop}','${r}','${user}','Ravi') returning id`,
  ))[0].id as string;

describe("direct writes are locked", () => {
  it("a tenant cannot forge offer columns on insert", async () => {
    await as("authenticated", T);
    const r = await q(
      `insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_name,offer_status,agreed_rent,offered_rent)
       values ('${L}','${prop}','${room}','${T}','Ravi','approved',1,1) returning offer_status, agreed_rent, offered_rent`,
    );
    expect(r[0]).toEqual({ offer_status: null, agreed_rent: null, offered_rent: null });
  });
  it("a tenant cannot edit the agreed rent or accept their own request; can cancel", async () => {
    const id = await mk();
    await as("authenticated", T);
    await fails(() => db.exec(`update bookings set agreed_rent = 1 where id='${id}'`), /OFFER_FIELDS_LOCKED/);
    await fails(() => db.exec(`update bookings set offer_status='approved' where id='${id}'`), /OFFER_FIELDS_LOCKED/);
    await fails(() => db.exec(`update bookings set status='accepted' where id='${id}'`), /BOOKING_STATUS_LOCKED/);
    await db.exec(`update bookings set status='cancelled' where id='${id}'`);
    expect((await q(`select status from bookings where id='${id}'`))[0].status).toBe("cancelled");
  });
  it("a landlord cannot write offer fields directly either", async () => {
    const id = await mk();
    await as("authenticated", L);
    await fails(() => db.exec(`update bookings set agreed_rent = 1 where id='${id}'`), /OFFER_FIELDS_LOCKED/);
  });
  it("offer functions are not callable by app users", async () => {
    const id = await mk();
    await as("authenticated", T);
    await fails(() => q(`select offer_submit('${id}','${T}',9000)`), /permission denied/);
    await fails(() => q(`select offer_decide('${id}','${L}','approve')`), /permission denied/);
  });
  it("the private floor is invisible to tenants and other landlords", async () => {
    await as("authenticated", T);
    expect(await q(`select * from room_offer_settings`)).toHaveLength(0);
    await as("authenticated", L2);
    expect(await q(`select * from room_offer_settings`)).toHaveLength(0);
    await fails(() => db.exec(`update room_offer_settings set min_rent = 1 where room_id='${room}'`).then(async () => {
      expect((await q(`select min_rent from room_offer_settings`)).length).toBe(0);
      throw new Error("no-row");
    }), /no-row/);
    await as("authenticated", L);
    expect((await q(`select min_rent from room_offer_settings`))[0].min_rent).toBe("8000");
  });
});

describe("offer_submit rules", () => {
  it("rejects rooms with offers off, offers >= rent, and offers below 50%", async () => {
    const off = await mk(T, room2);
    await svc(`select 1`);
    await fails(() => q(`select offer_submit('${off}','${T}',9000)`), /OFFERS_OFF/);
    const id = await mk(T2);
    await fails(() => q(`select offer_submit('${id}','${T2}',10000)`), /OFFER_NOT_LOWER/);
    await fails(() => q(`select offer_submit('${id}','${T2}',4999)`), /OFFER_TOO_LOW/);
    await fails(() => q(`select offer_submit('${id}','${L}',9000)`), /FORBIDDEN/);
  });
  it("limits a tenant to 2 offers per room per 7 days", async () => {
    const T3 = "00000000-0000-0000-0000-0000000000c3";
    for (let i = 0; i < 2; i++) {
      const id = await mk(T3);
      await svc(`select offer_submit('${id}','${T3}',9000)`);
    }
    const third = await mk(T3);
    await fails(() => q(`select offer_submit('${third}','${T3}',9000)`), /OFFER_LIMIT/);
  });
  it("pending offer notifies the landlord; floor and result are not leaked in the return", async () => {
    const T4 = "00000000-0000-0000-0000-0000000000c4";
    const id = await mk(T4);
    const r = (await svc(`select offer_submit('${id}','${T4}',7000) as r`))[0].r;
    expect(r).toEqual({ offer_status: "pending" });
    expect(JSON.stringify(r)).not.toContain("8000");
    const n = await q(`select * from notes_log where uid='${L}' and kind='booking_offer_new' order by body`);
    expect(n.length).toBeGreaterThan(0);
  });
  it("auto-approves the price when enabled and offer >= floor", async () => {
    await pg();
    await db.exec(`update room_offer_settings set auto_approve = true where room_id='${room}'`);
    const T5 = "00000000-0000-0000-0000-0000000000c5";
    const hi = await mk(T5);
    const r1 = (await svc(`select offer_submit('${hi}','${T5}',8500) as r`))[0].r;
    expect(r1.offer_status).toBe("approved");
    expect(Number((await q(`select agreed_rent from bookings where id='${hi}'`))[0].agreed_rent)).toBe(8500);
    const T6 = "00000000-0000-0000-0000-0000000000c6";
    const lo = await mk(T6);
    const r2 = (await svc(`select offer_submit('${lo}','${T6}',7000) as r`))[0].r;
    expect(r2.offer_status).toBe("pending");
    await pg();
    await db.exec(`update room_offer_settings set auto_approve = false where room_id='${room}'`);
  });
});

describe("landlord decisions and accepting", () => {
  const offered = async (user: string, amt: number) => {
    const id = await mk(user);
    await svc(`select offer_submit('${id}','${user}',${amt})`);
    return id;
  };
  it("accept is blocked while an offer is open; approve then accept uses the agreed rent", async () => {
    const id = await offered("00000000-0000-0000-0000-0000000000d1", 9000);
    await svc(`select 1`);
    await fails(() => q(`update bookings set status='accepted' where id='${id}'`), /OFFER_OPEN/);
    await fails(() => q(`select offer_agreed_rent('${id}')`), /OFFER_OPEN/);
    await fails(() => q(`select offer_decide('${id}','${L2}','approve')`), /FORBIDDEN/);
    await q(`select offer_decide('${id}','${L}','approve')`);
    expect(Number((await q(`select offer_agreed_rent('${id}') as r`))[0].r)).toBe(9000);
    await q(`update bookings set status='accepted' where id='${id}'`);
    expect((await q(`select status, offer_status from bookings where id='${id}'`))[0]).toEqual({ status: "accepted", offer_status: "approved" });
  });
  it("a normal booking (no offer) has no agreed rent", async () => {
    const id = await mk("00000000-0000-0000-0000-0000000000d9", room2);
    await svc(`select 1`);
    expect((await q(`select offer_agreed_rent('${id}') as r`))[0].r).toBeNull();
  });
  it("deny rejects the request and tells the tenant without any reason", async () => {
    const t = "00000000-0000-0000-0000-0000000000d2";
    const id = await offered(t, 6000);
    await svc(`select offer_decide('${id}','${L}','deny')`);
    expect((await q(`select status, offer_status from bookings where id='${id}'`))[0]).toEqual({ status: "rejected", offer_status: "declined" });
    const n = await q(`select body from notes_log where uid='${t}' and kind='booking_offer_declined'`);
    expect(n[0].body).not.toMatch(/\d{4}/);
  });
  it("counter: valid range, only once; tenant can accept; accept then lets the landlord confirm", async () => {
    const t = "00000000-0000-0000-0000-0000000000d3";
    const id = await offered(t, 6000);
    await svc(`select 1`);
    await fails(() => q(`select offer_decide('${id}','${L}','counter',5000)`), /COUNTER_INVALID/);
    await fails(() => q(`select offer_decide('${id}','${L}','counter',10001)`), /COUNTER_INVALID/);
    await q(`select offer_decide('${id}','${L}','counter',8000)`);
    await fails(() => q(`select offer_decide('${id}','${L}','counter',8500)`), /OFFER_INVALID_STATE/);
    await fails(() => q(`select offer_respond('${id}','${T}','accept')`), /FORBIDDEN/);
    await q(`select offer_respond('${id}','${t}','accept')`);
    expect(Number((await q(`select agreed_rent from bookings where id='${id}'`))[0].agreed_rent)).toBe(8000);
  });
  it("tenant declining a counter closes the request", async () => {
    const t = "00000000-0000-0000-0000-0000000000d4";
    const id = await offered(t, 6000);
    await svc(`select offer_decide('${id}','${L}','counter',7500)`);
    await q(`select offer_respond('${id}','${t}','decline')`);
    expect((await q(`select status, offer_status from bookings where id='${id}'`))[0]).toEqual({ status: "cancelled", offer_status: "declined" });
  });
  it("an unanswered counter expires after 24h and closes the request", async () => {
    const t = "00000000-0000-0000-0000-0000000000d5";
    const id = await offered(t, 6000);
    await svc(`select offer_decide('${id}','${L}','counter',7500)`);
    await q(`update bookings set offer_expires_at = now() - interval '1 minute' where id='${id}'`);
    expect((await q(`select offer_respond('${id}','${t}','accept') as r`))[0].r).toEqual({ offer_status: "expired" });
    expect((await q(`select status, offer_status from bookings where id='${id}'`))[0]).toEqual({ status: "cancelled", offer_status: "expired" });
  });
  it("a landlord rejecting through the old path closes the offer; tenant cancelling withdraws it", async () => {
    const id = await offered("00000000-0000-0000-0000-0000000000d6", 9000);
    await as("authenticated", L);
    await db.exec(`update bookings set status='rejected' where id='${id}'`);
    expect((await q(`select offer_status from bookings where id='${id}'`))[0].offer_status).toBe("declined");
    const t = "00000000-0000-0000-0000-0000000000d7";
    const id2 = await offered(t, 9000);
    await as("authenticated", t);
    await db.exec(`update bookings set status='cancelled' where id='${id2}'`);
    expect((await q(`select offer_status from bookings where id='${id2}'`))[0].offer_status).toBe("withdrawn");
  });
});
