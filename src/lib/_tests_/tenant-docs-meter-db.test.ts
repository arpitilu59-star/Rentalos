/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real migration SQL against in-memory Postgres (PGlite). Not a live Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const T = "00000000-0000-0000-0000-0000000000a1"; // tenant user
const L = "00000000-0000-0000-0000-0000000000b2"; // landlord
const X = "00000000-0000-0000-0000-0000000000c3"; // outsider
const ROOM = "00000000-0000-0000-0000-0000000000d4";
const TEN = "00000000-0000-0000-0000-0000000000e5";
let db: PGlite;
const q = async (s: string) => (await db.query<any>(s)).rows;
const pg = async () => { await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE;"); };
const as = async (uid: string) => {
  await pg();
  await db.exec(`select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub','${uid}',false);`);
  await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE authenticated;`);
};
const decide = (id: string, approve: boolean, reading: string, owner = L) =>
  q(`select public.decide_meter_submission('${owner}','${id}',${approve},${reading},'ok') as r`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE TABLE storage.buckets (id text primary key, name text, public boolean);
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    CREATE TABLE public.rooms (id uuid primary key);
    CREATE TABLE public.tenants (id uuid primary key);
    CREATE TABLE public.meter_readings (id uuid primary key default gen_random_uuid(), owner_id uuid not null, room_id uuid not null,
      reading numeric not null, reading_date date not null default current_date, photo_path text, ai_detected boolean not null default false,
      notes text, created_at timestamptz not null default now());
    INSERT INTO public.rooms VALUES ('${ROOM}'); INSERT INTO public.tenants VALUES ('${TEN}');
    INSERT INTO public.meter_readings (owner_id, room_id, reading) VALUES ('${L}','${ROOM}', 100);
  `);
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20260930000000_tenant_docs_meter.sql"), "utf8"));
  await pg();
});

describe("tenant documents", () => {
  it("not verified until an admin approves an ID; a photo alone does not count", async () => {
    await pg();
    await db.exec(`insert into tenant_documents (user_id, doc_type, storage_path) values ('${T}','aadhaar','a/1.jpg'), ('${T}','photo','a/2.jpg')`);
    expect((await q(`select tenant_verified('${T}') v`))[0].v).toBe(false);
    await db.exec(`update tenant_documents set status='verified' where doc_type='photo'`);
    expect((await q(`select tenant_verified('${T}') v`))[0].v).toBe(false);
    await db.exec(`update tenant_documents set status='verified' where doc_type='aadhaar'`);
    expect((await q(`select tenant_verified('${T}') v`))[0].v).toBe(true);
  });
  it("users only see their own documents and cannot write", async () => {
    await as(T); expect(await q(`select id from tenant_documents`)).toHaveLength(2);
    await as(X); expect(await q(`select id from tenant_documents`)).toHaveLength(0);
    await as(T);
    await expect(db.exec(`update tenant_documents set status='verified'`)).rejects.toThrow();
    await expect(db.exec(`insert into tenant_documents (user_id, doc_type, storage_path) values ('${T}','pan','x')`)).rejects.toThrow();
  });
});

describe("meter submissions", () => {
  let id: string;
  it("only one pending per tenant+room", async () => {
    await pg();
    id = (await q(`insert into meter_submissions (tenant_id, room_id, owner_id, submitted_by, reading) values ('${TEN}','${ROOM}','${L}','${T}', 130) returning id`))[0].id;
    await expect(db.exec(`insert into meter_submissions (tenant_id, room_id, owner_id, submitted_by, reading) values ('${TEN}','${ROOM}','${L}','${T}', 131)`)).rejects.toThrow();
  });
  it("tenant and landlord can read it, outsiders cannot; nobody writes directly", async () => {
    for (const u of [T, L]) { await as(u); expect(await q(`select id from meter_submissions`)).toHaveLength(1); }
    await as(X); expect(await q(`select id from meter_submissions`)).toHaveLength(0);
    await as(L);
    await expect(db.exec(`update meter_submissions set status='approved'`)).rejects.toThrow();
    await expect(db.exec(`select public.decide_meter_submission('${L}','${id}',true,null,'')`)).rejects.toThrow();
  });
  it("nothing reaches meter_readings until approved", async () => {
    await pg();
    expect(await q(`select id from meter_readings`)).toHaveLength(1);
  });
  it("a landlord cannot decide someone else's reading", async () => {
    await pg();
    await expect(decide(id, true, "null", X)).rejects.toThrow(/not found/i);
  });
  it("cannot approve below the last recorded reading", async () => {
    await pg();
    await expect(decide(id, true, "90")).rejects.toThrow(/lower than the last/i);
  });
  it("approve with an edited number writes that number to meter_readings", async () => {
    await pg();
    const r = (await decide(id, true, "128"))[0].r;
    expect(r.status).toBe("approved");
    const rows = await q(`select reading from meter_readings order by created_at desc, reading desc`);
    expect(rows.map((x: any) => Number(x.reading))).toContain(128);
    const s = (await q(`select status, approved_reading, reading from meter_submissions where id='${id}'`))[0];
    expect(s.status).toBe("approved"); expect(Number(s.approved_reading)).toBe(128); expect(Number(s.reading)).toBe(130);
  });
  it("cannot be decided twice; reject writes nothing", async () => {
    await pg();
    await expect(decide(id, true, "null")).rejects.toThrow(/already approved/i);
    const id2 = (await q(`insert into meter_submissions (tenant_id, room_id, owner_id, submitted_by, reading) values ('${TEN}','${ROOM}','${L}','${T}', 140) returning id`))[0].id;
    const before = (await q(`select count(*)::int c from meter_readings`))[0].c;
    expect((await decide(id2, false, "null"))[0].r.status).toBe("rejected");
    expect((await q(`select count(*)::int c from meter_readings`))[0].c).toBe(before);
  });
});
