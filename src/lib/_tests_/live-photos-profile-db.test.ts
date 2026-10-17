/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real migration SQL against in-memory Postgres (PGlite). Not a live Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const L = "00000000-0000-0000-0000-0000000000b1";
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
const asService = async () => {
  await pg();
  await db.exec(`select set_config('request.jwt.claim.role','service_role',false), set_config('request.jwt.claim.sub','',false);`);
};
const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true),'')::text $$;
    CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    CREATE FUNCTION storage.foldername(n text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(n,'/') $$;
    CREATE TABLE public.properties (id uuid primary key default gen_random_uuid());
    CREATE TABLE public.rooms (id uuid primary key default gen_random_uuid(), owner_id uuid, property_id uuid, room_number text,
      is_public boolean not null default false, myr_available boolean not null default true);
    CREATE TABLE public.tenants (id uuid primary key default gen_random_uuid(), owner_id uuid, room_id uuid references public.rooms(id) on delete cascade, name text, active boolean not null default true);
    CREATE TABLE public.bookings (id uuid primary key default gen_random_uuid(), landlord_id uuid, tenant_user_id uuid, room_id uuid, status text default 'pending', created_at timestamptz default now());
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
  `);
  await db.exec(mig("20260923000000_room_availability_lifecycle.sql"));
  await db.exec(mig("20260926000000_live_photos_room_profile.sql"));
  await db.exec(`GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;`);
  prop = (await q(`insert into properties default values returning id`))[0].id;
});

const newRoom = async (extra = "") =>
  (await q(`insert into rooms (owner_id,property_id,room_number,is_public,myr_available ${extra ? "," + extra.split("|")[0] : ""})
     values ('${L}','${prop}','R${Math.random().toString(36).slice(2, 6)}',false,true ${extra ? "," + extra.split("|")[1] : ""}) returning id`))[0].id as string;

describe("room profile required before publishing", () => {
  it("blocks publish until occupant type and size are set", async () => {
    await pg();
    const r = await newRoom();
    await expect(db.exec(`update rooms set is_public=true where id='${r}'`)).rejects.toThrow(/ROOM_PROFILE_INCOMPLETE/);
    await expect(db.exec(`update rooms set is_public=true, occupant_type='boys' where id='${r}'`)).rejects.toThrow(/ROOM_PROFILE_INCOMPLETE/);
    await q(`update rooms set is_public=true, occupant_type='girls', room_size='1bhk' where id='${r}' returning id`);
    expect((await q(`select is_public from rooms where id='${r}'`))[0].is_public).toBe(true);
  });
  it("rejects values outside the allowed lists", async () => {
    await pg();
    const r = await newRoom();
    await expect(db.exec(`update rooms set occupant_type='aliens' where id='${r}'`)).rejects.toThrow();
    await expect(db.exec(`update rooms set room_size='castle' where id='${r}'`)).rejects.toThrow();
  });
  it("an old room without a profile is still auto-republished when its tenant leaves", async () => {
    await pg();
    const r = (await q(`insert into rooms (owner_id,property_id,room_number,is_public) values ('${L}','${prop}','OLD',true) returning id`))[0].id;
    const t = (await q(`insert into tenants (owner_id,room_id,name) values ('${L}','${r}','T') returning id`))[0].id;
    expect((await q(`select is_public from rooms where id='${r}'`))[0].is_public).toBe(false);
    await q(`update tenants set active=false where id='${t}' returning id`);
    expect((await q(`select is_public, myr_available from rooms where id='${r}'`))[0]).toEqual({ is_public: true, myr_available: true });
  });
});

describe("live photos", () => {
  it("the owner can add a photo but can never self-verify", async () => {
    await pg();
    const r = await newRoom();
    await as("authenticated", L);
    const id = (await q(`insert into live_feed_photos (owner_id,room_id,storage_path,verification_status,expires_at)
      values ('${L}','${r}','${L}/a.jpg','verified', now() + interval '1 day') returning id`))[0].id;
    expect((await q(`select verification_status, expires_at from live_feed_photos where id='${id}'`))[0]).toEqual({ verification_status: "pending", expires_at: null });
    await expect(db.exec(`update live_feed_photos set verification_status='verified' where id='${id}'`)).rejects.toThrow(/Only the platform/);
    await asService();
    await db.exec(`update live_feed_photos set verification_status='verified', expires_at=now()+interval '150 days' where id='${id}'`);
    expect((await q(`select verification_status from live_feed_photos where id='${id}'`))[0].verification_status).toBe("verified");
  });
  it("the public sees verified, unexpired photos only", async () => {
    await pg();
    const r = await newRoom();
    await asService();
    await db.exec(`insert into live_feed_photos (owner_id,room_id,storage_path,verification_status,expires_at) values
      ('${L}','${r}','x/1.jpg','verified', now()+interval '1 day'),
      ('${L}','${r}','x/2.jpg','pending', null),
      ('${L}','${r}','x/3.jpg','verified', now()-interval '1 day')`);
    await as("anon", null);
    expect((await q(`select storage_path from live_feed_photos where room_id='${r}' order by storage_path`)).map((x: any) => x.storage_path)).toEqual(["x/1.jpg"]);
  });
  it("must target exactly one of room / property", async () => {
    await pg();
    await expect(db.exec(`insert into live_feed_photos (owner_id,storage_path) values ('${L}','x')`)).rejects.toThrow();
  });
});
