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
const ACKS = {
  rent_and_deposit: true,
  notice_and_lock_in: true,
  house_rules: true,
  charges_and_electricity: true,
  responsibilities: true,
};
let db: PGlite;
let prop: string, room: string, bookingId: string, tenantRow: string;
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

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE FUNCTION public.is_admin(_u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE TABLE public.activity_log (id uuid primary key default gen_random_uuid(), user_id uuid not null, action text not null, target_type text, target_id text, metadata jsonb not null default '{}', created_at timestamptz default now());
    CREATE TABLE public.notes_log (uid uuid, kind text);
    CREATE FUNCTION public.notify_user(u uuid, k text, t text, b text, l text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.notes_log VALUES (u,k) $$;
    CREATE TABLE public.properties (id uuid primary key default gen_random_uuid(), owner_id uuid not null, name text, city text, is_public_listing boolean default true);
    CREATE TABLE public.rooms (id uuid primary key default gen_random_uuid(), owner_id uuid, property_id uuid, room_number text, rent_amount numeric, myr_deposit numeric);
    CREATE TABLE public.bookings (id uuid primary key default gen_random_uuid(), landlord_id uuid, property_id uuid references public.properties(id) on delete cascade, room_id uuid, tenant_user_id uuid, tenant_name text, tenant_id uuid, status text default 'pending', created_at timestamptz default now());
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(mig("20260922000000_rental_terms.sql"));
  await db.exec(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;`);
  prop = (
    await q(
      `insert into properties (owner_id,name,city) values ('${L}','Sai PG','Jaipur') returning id`,
    )
  )[0].id;
  room = (
    await q(
      `insert into rooms (owner_id,property_id,room_number,rent_amount,myr_deposit) values ('${L}','${prop}','101',8000,16000) returning id`,
    )
  )[0].id;
});

const mkBooking = async (user = T) =>
  (
    await q(
      `insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_name) values ('${L}','${prop}','${room}','${user}','Ravi') returning id`,
    )
  )[0].id as string;
const terms = (n = 30) => JSON.stringify({ pets: "allowed", notice_period_days: n });

describe("publishing versions", () => {
  it("only the owner can publish; versions increment; summary mirrors current", async () => {
    await pg();
    await expect(
      db.exec(`select publish_rental_terms('${L2}','${prop}','${terms()}'::jsonb,40,null)`),
    ).rejects.toThrow(/Property not found/);
    const v1 = (
      await q(`select publish_rental_terms('${L}','${prop}','${terms(30)}'::jsonb,40,'first') r`)
    )[0].r;
    expect(v1.version).toBe(1);
    const v2 = (
      await q(
        `select publish_rental_terms('${L}','${prop}','${terms(45)}'::jsonb,40,'notice up') r`,
      )
    )[0].r;
    expect(v2.version).toBe(2);
    const p = (
      await q(
        `select current_terms_version v, terms_summary->>'notice_period_days' n from properties where id='${prop}'`,
      )
    )[0];
    expect(p).toEqual({ v: 2, n: "45" });
    await expect(
      db.exec(`select publish_rental_terms('${L}','${prop}','${terms(45)}'::jsonb,40,null)`),
    ).rejects.toThrow(/No changes/);
  });
  it("versions are immutable; browser roles can't call publish", async () => {
    await pg();
    await expect(db.exec(`update rental_terms_versions set terms='{}'::jsonb`)).rejects.toThrow(
      /immutable/,
    );
    await expect(db.exec(`delete from rental_terms_versions`)).rejects.toThrow(/immutable/);
    await as("authenticated", L);
    await expect(
      db.exec(`select publish_rental_terms('${L}','${prop}','${terms(60)}'::jsonb,40,null)`),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(
        `insert into rental_terms_versions (property_id,version,terms,terms_hash,created_by) values ('${prop}',9,'{}','x','${L}')`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("public listings' terms are readable by anon", async () => {
    await as("anon", null);
    expect((await q(`select count(*)::int n from rental_terms_versions`))[0].n).toBe(2);
  });
});

describe("terms acceptance snapshot", () => {
  it("needs every acknowledgement; builds snapshot from DB; stores hash and version", async () => {
    await pg();
    bookingId = await mkBooking();
    await expect(
      db.exec(
        `select record_terms_acceptance('${T}','${bookingId}','{"rent_and_deposit":true}'::jsonb,false)`,
      ),
    ).rejects.toThrow(/tick every acknowledgement/);
    const r = (
      await q(
        `select record_terms_acceptance('${T}','${bookingId}','${JSON.stringify(ACKS)}'::jsonb,true) r`,
      )
    )[0].r;
    expect(r.terms_version).toBe(2);
    const a = (
      await q(
        `select snapshot, listened, snapshot_hash from booking_terms_acceptances where booking_id='${bookingId}'`,
      )
    )[0];
    expect(a.snapshot.terms.notice_period_days).toBe(45);
    expect(Number(a.snapshot.room.rent_amount)).toBe(8000);
    expect(a.listened).toBe(true);
    expect(a.snapshot_hash).toHaveLength(64);
  });
  it("later terms changes never alter an accepted snapshot", async () => {
    await pg();
    await db.exec(`select publish_rental_terms('${L}','${prop}','${terms(90)}'::jsonb,40,'v3')`);
    const a = (
      await q(
        `select terms_version v, snapshot->'terms'->>'notice_period_days' n from booking_terms_acceptances where booking_id='${bookingId}'`,
      )
    )[0];
    expect(a).toEqual({ v: 2, n: "45" });
    await expect(db.exec(`update booking_terms_acceptances set listened=false`)).rejects.toThrow(
      /immutable/,
    );
    await expect(db.exec(`delete from booking_terms_acceptances`)).rejects.toThrow(/immutable/);
  });
  it("double acceptance, wrong user and decided booking are refused", async () => {
    await pg();
    await expect(
      db.exec(
        `select record_terms_acceptance('${T}','${bookingId}','${JSON.stringify(ACKS)}'::jsonb,false)`,
      ),
    ).rejects.toThrow(/already accepted/);
    const b2 = await mkBooking(T2);
    await expect(
      db.exec(
        `select record_terms_acceptance('${T}','${b2}','${JSON.stringify(ACKS)}'::jsonb,false)`,
      ),
    ).rejects.toThrow(/Booking not found/);
    await db.exec(`update bookings set status='accepted' where id='${b2}'`);
    await expect(
      db.exec(
        `select record_terms_acceptance('${T2}','${b2}','${JSON.stringify(ACKS)}'::jsonb,false)`,
      ),
    ).rejects.toThrow(/pending/);
  });
  it("a property with no published terms records NOT_SPECIFIED and needs no acks", async () => {
    await pg();
    const p2 = (
      await q(`insert into properties (owner_id,name) values ('${L}','Old PG') returning id`)
    )[0].id;
    const r2 = (
      await q(
        `insert into rooms (owner_id,property_id,room_number,rent_amount) values ('${L}','${p2}','1',5000) returning id`,
      )
    )[0].id;
    const b = (
      await q(
        `insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_name) values ('${L}','${p2}','${r2}','${T}','R') returning id`,
      )
    )[0].id;
    await db.exec(`select record_terms_acceptance('${T}','${b}','{}'::jsonb,false)`);
    expect(
      (
        await q(
          `select snapshot->>'terms_status' s from booking_terms_acceptances where booking_id='${b}'`,
        )
      )[0].s,
    ).toBe("NOT_SPECIFIED");
  });
  it("RLS: tenant and landlord see it, a stranger doesn't", async () => {
    await as("authenticated", T);
    expect((await q(`select count(*)::int n from booking_terms_acceptances`))[0].n).toBeGreaterThan(
      0,
    );
    await as("authenticated", L);
    expect((await q(`select count(*)::int n from booking_terms_acceptances`))[0].n).toBeGreaterThan(
      0,
    );
    await as("authenticated", "00000000-0000-0000-0000-0000000000ff");
    expect((await q(`select count(*)::int n from booking_terms_acceptances`))[0].n).toBe(0);
  });
  it("landlord notified; audit events logged", async () => {
    await pg();
    expect(
      (
        await q(
          `select count(*)::int n from notes_log where kind='booking_terms_accepted' and uid='${L}'`,
        )
      )[0].n,
    ).toBeGreaterThan(0);
    const acts = (await q(`select distinct action from activity_log order by 1`)).map(
      (r) => r.action,
    );
    expect(acts).toEqual(expect.arrayContaining(["terms_version_created", "terms_accepted"]));
  });
});

describe("pre-payment gate status", () => {
  it("LEGACY (no booking), REQUIRED, ACCEPTED, NOT_SPECIFIED", async () => {
    await pg();
    const legacy = "00000000-0000-0000-0000-0000000000aa";
    expect((await q(`select terms_gate_status('${legacy}') s`))[0].s).toBe("LEGACY");
    tenantRow = "00000000-0000-0000-0000-0000000000d1";
    const b = await mkBooking("00000000-0000-0000-0000-0000000000c9");
    await db.exec(`update bookings set tenant_id='${tenantRow}' where id='${b}'`);
    expect((await q(`select terms_gate_status('${tenantRow}') s`))[0].s).toBe("REQUIRED");
    await db.exec(
      `select record_terms_acceptance('00000000-0000-0000-0000-0000000000c9','${b}','${JSON.stringify(ACKS)}'::jsonb,false)`,
    );
    expect((await q(`select terms_gate_status('${tenantRow}') s`))[0].s).toBe("ACCEPTED");
    const p3 = (await q(`insert into properties (owner_id) values ('${L}') returning id`))[0].id;
    const b3 = (
      await q(
        `insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_id) values ('${L}','${p3}','${room}','${T}','00000000-0000-0000-0000-0000000000d3') returning id`,
      )
    )[0].id;
    expect(b3).toBeTruthy();
    expect(
      (await q(`select terms_gate_status('00000000-0000-0000-0000-0000000000d3') s`))[0].s,
    ).toBe("NOT_SPECIFIED");
  });
  it("deleting a property cascades cleanly despite immutability", async () => {
    await pg();
    await expect(db.exec(`delete from properties where id='${prop}'`)).resolves.not.toThrow();
    expect(
      (await q(`select count(*)::int n from rental_terms_versions where property_id='${prop}'`))[0]
        .n,
    ).toBe(0);
  });
});
