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
  await db.exec(mig("20260925000000_terms_reacceptance.sql"));
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


const mkBooking = async (status = "pending") =>
  (await q(`insert into bookings (landlord_id,property_id,room_id,tenant_user_id,tenant_name,status) values ('${L}','${prop}','${room}','${T}','Ravi','${status}') returning id`))[0].id as string;
const publish = async (n: number) => q(`select publish_rental_terms('${L}','${prop}','{"notice_period_days":${n}}'::jsonb,40,null) r`);

describe("terms re-acceptance", () => {
  it("not needed until a newer version is published", async () => {
    await pg();
    await publish(30);
    const b = await mkBooking();
    await db.exec(`select record_terms_acceptance('${T}','${b}','${JSON.stringify(ACKS)}'::jsonb,false)`);
    expect((await q(`select terms_reaccept_status('${b}') r`))[0].r.needs).toBe(false);
    await expect(db.exec(`select record_terms_reacceptance('${T}','${b}','${JSON.stringify(ACKS)}'::jsonb,false)`)).rejects.toThrow(/already accepted/);
    await publish(60);
    expect((await q(`select terms_reaccept_status('${b}') r`))[0].r).toMatchObject({ needs: true, current_version: 2, accepted_version: 1 });
    (globalThis as any).__b = b;
  });
  it("needs all acks, only the booking's tenant, and keeps the original acceptance", async () => {
    const b = (globalThis as any).__b as string;
    await expect(db.exec(`select record_terms_reacceptance('${T}','${b}','{"house_rules":true}'::jsonb,false)`)).rejects.toThrow(/tick every/);
    await expect(db.exec(`select record_terms_reacceptance('${T2}','${b}','${JSON.stringify(ACKS)}'::jsonb,false)`)).rejects.toThrow(/Booking not found/);
    const r = (await q(`select record_terms_reacceptance('${T}','${b}','${JSON.stringify(ACKS)}'::jsonb,true) r`))[0].r;
    expect(r.terms_version).toBe(2);
    expect((await q(`select terms_reaccept_status('${b}') r`))[0].r.needs).toBe(false);
    expect((await q(`select count(*)::int n from booking_terms_acceptances where booking_id='${b}'`))[0].n).toBe(1);
    await expect(db.exec(`update booking_terms_reacceptances set listened=false`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`delete from booking_terms_reacceptances`)).rejects.toThrow(/immutable/);
  });
  it("is not callable by users; closed bookings are refused", async () => {
    await as("authenticated", T);
    await expect(db.exec(`select record_terms_reacceptance('${T}','${(globalThis as any).__b}','{}'::jsonb,false)`)).rejects.toThrow(/permission denied/i);
    await pg();
    const b = await mkBooking("rejected");
    await expect(db.exec(`select record_terms_reacceptance('${T}','${b}','${JSON.stringify(ACKS)}'::jsonb,false)`)).rejects.toThrow(/closed/);
  });
});
