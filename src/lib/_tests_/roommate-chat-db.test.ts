/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real migration SQL against in-memory Postgres (PGlite). Not a live Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const A = "00000000-0000-0000-0000-00000000c0a1";
const B = "00000000-0000-0000-0000-00000000c0b2";
const C = "00000000-0000-0000-0000-00000000c0c3";
let db: PGlite;
let thread: string;
const q = async (s: string) => (await db.query<any>(s)).rows;
const pg = async () => { await db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE;"); };
const as = async (uid: string) => {
  await pg();
  await db.exec(`select set_config('request.jwt.claim.role','authenticated',false), set_config('request.jwt.claim.sub','${uid}',false);`);
  await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE authenticated;`);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
  `);
  await db.exec(readFileSync(join(process.cwd(), "supabase/migrations/20260927000000_roommate_chat.sql"), "utf8"));
  await pg();
  thread = (await q(`insert into roommate_threads (requester_id, recipient_id) values ('${A}','${B}') returning id`))[0].id;
  await db.exec(`insert into roommate_messages (thread_id, sender_id, body) values ('${thread}','${A}','hi')`);
});

describe("roommate chat SQL", () => {
  it("participants can read their thread and messages", async () => {
    for (const u of [A, B]) {
      await as(u);
      expect(await q(`select id from roommate_threads`)).toHaveLength(1);
      expect(await q(`select id from roommate_messages`)).toHaveLength(1);
    }
  });
  it("outsiders see nothing", async () => {
    await as(C);
    expect(await q(`select id from roommate_threads`)).toHaveLength(0);
    expect(await q(`select id from roommate_messages`)).toHaveLength(0);
  });
  it("users cannot write directly (server only)", async () => {
    await as(A);
    await expect(db.exec(`insert into roommate_messages (thread_id, sender_id, body) values ('${thread}','${A}','x')`)).rejects.toThrow();
    await expect(db.exec(`update roommate_threads set status='active'`)).rejects.toThrow();
  });
  it("one thread per pair, in either direction; no self-chat; body length enforced", async () => {
    await pg();
    await expect(db.exec(`insert into roommate_threads (requester_id, recipient_id) values ('${B}','${A}')`)).rejects.toThrow();
    await expect(db.exec(`insert into roommate_threads (requester_id, recipient_id) values ('${A}','${A}')`)).rejects.toThrow();
    await expect(db.exec(`insert into roommate_messages (thread_id, sender_id, body) values ('${thread}','${A}','')`)).rejects.toThrow();
  });
});
