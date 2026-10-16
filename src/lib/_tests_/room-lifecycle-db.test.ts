/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real migration SQL against in-memory Postgres (PGlite). Not a live Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const L = "00000000-0000-0000-0000-0000000000b1";
const T = "00000000-0000-0000-0000-0000000000c1";
let db: PGlite;
let prop: string;
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

const newRoom = async (opts: { capacity?: number; pub?: boolean; avail?: boolean } = {}) =>
  (
    await q(
      `insert into rooms (owner_id,property_id,room_number,capacity,is_public,myr_available)
       values ('${L}','${prop}','R${Math.random().toString(36).slice(2, 6)}',${opts.capacity ?? 1},${opts.pub ?? true},${opts.avail ?? true}) returning id`,
    )
  )[0].id as string;
const state = async (id: string) =>
  (await q(`select is_public, myr_available, auto_unpublished from rooms where id='${id}'`))[0];
const addTenant = async (room: string, active = true) =>
  (
    await q(
      `insert into tenants (owner_id,room_id,name,active) values ('${L}','${room}','T',${active}) returning id`,
    )
  )[0].id as string;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true),'')::text $$;
    CREATE TABLE public.properties (id uuid primary key default gen_random_uuid());
    CREATE TABLE public.rooms (id uuid primary key default gen_random_uuid(), owner_id uuid, property_id uuid, room_number text,
      is_public boolean not null default false, myr_available boolean not null default true);
    CREATE TABLE public.tenants (id uuid primary key default gen_random_uuid(), owner_id uuid, room_id uuid references public.rooms(id) on delete cascade, name text, active boolean not null default true);
    CREATE TABLE public.bookings (id uuid primary key default gen_random_uuid(), landlord_id uuid, tenant_user_id uuid, room_id uuid, status text default 'pending', created_at timestamptz default now());
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20260923000000_room_availability_lifecycle.sql"), "utf8"));
  prop = (await q(`insert into properties default values returning id`))[0].id;
});

describe("room availability follows occupancy", () => {
  it("a booked (tenant added) room leaves the marketplace", async () => {
    await pg();
    const r = await newRoom();
    await addTenant(r);
    expect(await state(r)).toEqual({ is_public: false, myr_available: false, auto_unpublished: true });
  });

  it("when the tenant becomes inactive the room is published again automatically", async () => {
    await pg();
    const r = await newRoom();
    const t = await addTenant(r);
    await q(`update tenants set active=false where id='${t}' returning id`);
    expect(await state(r)).toEqual({ is_public: true, myr_available: true, auto_unpublished: false });
  });

  it("deleting the tenant also frees the room", async () => {
    await pg();
    const r = await newRoom();
    const t = await addTenant(r);
    await q(`delete from tenants where id='${t}' returning id`);
    expect((await state(r)).is_public).toBe(true);
  });

  it("a room the landlord unpublished by hand is NOT republished", async () => {
    await pg();
    const r = await newRoom({ pub: false });
    const t = await addTenant(r);
    await q(`update tenants set active=false where id='${t}' returning id`);
    expect(await state(r)).toEqual({ is_public: false, myr_available: true, auto_unpublished: false });
  });

  it("manual publish of a full room is rejected; works once vacant", async () => {
    await pg();
    const r = await newRoom();
    const t = await addTenant(r);
    await expect(db.exec(`update rooms set is_public=true where id='${r}'`)).rejects.toThrow(/ROOM_FULL/);
    await q(`update tenants set active=false where id='${t}' returning id`);
    await q(`update rooms set is_public=false where id='${r}' returning id`);
    await q(`update rooms set is_public=true where id='${r}' returning id`);
    expect(await state(r)).toEqual({ is_public: true, myr_available: true, auto_unpublished: false });
  });

  it("shared room (capacity 2) stays listed until full", async () => {
    await pg();
    const r = await newRoom({ capacity: 2 });
    const a = await addTenant(r);
    expect((await state(r)).is_public).toBe(true);
    await addTenant(r);
    expect((await state(r)).is_public).toBe(false);
    await q(`update tenants set active=false where id='${a}' returning id`);
    expect((await state(r)).is_public).toBe(true);
  });

  it("raising capacity on a full room relists it", async () => {
    await pg();
    const r = await newRoom();
    await addTenant(r);
    await q(`update rooms set capacity=2 where id='${r}' returning id`);
    expect(await state(r)).toEqual({ is_public: true, myr_available: true, auto_unpublished: false });
  });

  it("moving a tenant to another room updates both rooms", async () => {
    await pg();
    const a = await newRoom();
    const b = await newRoom();
    const t = await addTenant(a);
    await q(`update tenants set room_id='${b}' where id='${t}' returning id`);
    expect((await state(a)).is_public).toBe(true);
    expect((await state(b)).is_public).toBe(false);
  });

  it("heals a vacant room stuck on myr_available=false", async () => {
    await pg();
    const r = await newRoom({ avail: false });
    await q(`select sync_room_availability('${r}') x`);
    expect((await state(r)).myr_available).toBe(true);
  });
});

describe("admin-only booking review columns", () => {
  it("a landlord cannot self-confirm; service role can", async () => {
    await pg();
    const r = await newRoom();
    const b = (
      await q(`insert into bookings (landlord_id,tenant_user_id,room_id) values ('${L}','${T}','${r}') returning id`)
    )[0].id;
    await as("authenticated", L);
    await expect(
      db.exec(`update bookings set admin_review='confirmed' where id='${b}'`),
    ).rejects.toThrow(/Only an admin/);
    await db.exec(`update bookings set status='accepted' where id='${b}'`); // normal landlord update still fine
    await as("service_role", null);
    await db.exec(`update bookings set admin_review='confirmed', admin_note='called' where id='${b}'`);
    await pg();
    expect((await q(`select admin_review from bookings where id='${b}'`))[0].admin_review).toBe("confirmed");
  });

  it("rejects an unknown review value", async () => {
    await pg();
    await expect(db.exec(`update bookings set admin_review='maybe'`)).rejects.toThrow();
  });
});
