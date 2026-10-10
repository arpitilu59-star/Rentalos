/**
 * Runs the REAL migration SQL against an in-memory Postgres (PGlite) with
 * minimal stand-ins for Supabase's auth schema. This reproduces the original
 * "Only an admin can decide a verification." bug and proves the fix.
 * It is NOT a test against a live Supabase project.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const LANDLORD = "00000000-0000-0000-0000-0000000000b2";
const OTHER = "00000000-0000-0000-0000-0000000000c3";

async function as(db: PGlite, role: "service_role" | "authenticated" | "anon", uid: string | null) {
  await db.exec(`SET SESSION AUTHORIZATION postgres;`);
  await db.exec(
    `SELECT set_config('request.jwt.claim.role','${role}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false);`,
  );
  // session_user mirrors PostgREST: the connection user is "authenticator", never postgres.
  await db.exec(
    `SET SESSION AUTHORIZATION authenticator; SET ROLE ${role === "service_role" ? "service_role" : role};`,
  );
}

async function fresh(applyFix: boolean) {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true),'') $$;
    CREATE TABLE public.admin_users (user_id uuid, role text, active boolean);
    CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id=_uid AND active) $$;
    CREATE TABLE public.myr_verifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, kind text, status text NOT NULL DEFAULT 'pending', id_doc_path text, reviewed_by uuid, reviewed_at timestamptz, rejection_reason text);
    CREATE TABLE public.verifications (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'pending', reviewed_by uuid, reviewed_at timestamptz, rejection_reason text);
    GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth TO anon, authenticated, service_role;
    INSERT INTO public.admin_users VALUES ('${ADMIN}','root_owner',true);
  `);
  await db.exec(mig("20260822000000_verification_review_lockdown.sql")); // the ORIGINAL (buggy) trigger
  if (applyFix) await db.exec(mig("20260920000000_verification_decide_fix.sql"));
  return db;
}

async function seedPending(db: PGlite) {
  await db.exec(`SET SESSION AUTHORIZATION postgres;`);
  const r = await db.query<{ id: string }>(
    `INSERT INTO public.myr_verifications (user_id, kind) VALUES ('${LANDLORD}','landlord') RETURNING id`,
  );
  return r.rows[0].id;
}

describe("BEFORE the fix (original migration)", () => {
  it("reproduces: service-role decision is rejected with the reported error", async () => {
    const db = await fresh(false);
    const id = await seedPending(db);
    await as(db, "service_role", null); // service-role requests carry NO user sub
    await expect(
      db.exec(
        `UPDATE public.myr_verifications SET status='verified', reviewed_by='${ADMIN}' WHERE id='${id}'`,
      ),
    ).rejects.toThrow(/Only an admin can decide a verification/);
  });
});

describe("AFTER the fix", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await fresh(true);
  });

  it("server (service role) can approve and reject", async () => {
    const id = await seedPending(db);
    await as(db, "service_role", null); // service-role requests carry NO user sub
    await db.exec(
      `UPDATE public.myr_verifications SET status='verified', reviewed_by='${ADMIN}', reviewed_at=now() WHERE id='${id}'`,
    );
    await db.exec(
      `UPDATE public.myr_verifications SET status='rejected', rejection_reason='blurry' WHERE id='${id}'`,
    );
    await db.exec(`SET SESSION AUTHORIZATION postgres;`);
    const r = await db.query<{ status: string }>(
      `SELECT status FROM public.myr_verifications WHERE id='${id}'`,
    );
    expect(r.rows[0].status).toBe("rejected");
  });

  it("an active admin calling the DB directly can decide", async () => {
    const id = await seedPending(db);
    await as(db, "authenticated", ADMIN);
    await db.exec(`UPDATE public.myr_verifications SET status='verified' WHERE id='${id}'`);
  });

  it("a landlord cannot self-approve", async () => {
    const id = await seedPending(db);
    await as(db, "authenticated", LANDLORD);
    await expect(
      db.exec(`UPDATE public.myr_verifications SET status='verified' WHERE id='${id}'`),
    ).rejects.toThrow(/Only an admin/);
    await expect(
      db.exec(`UPDATE public.myr_verifications SET reviewed_by='${LANDLORD}' WHERE id='${id}'`),
    ).rejects.toThrow(/Only an admin/);
  });

  it("a landlord can still update their own document paths", async () => {
    const id = await seedPending(db);
    await as(db, "authenticated", LANDLORD);
    await db.exec(`UPDATE public.myr_verifications SET id_doc_path='x/y.pdf' WHERE id='${id}'`);
  });

  it("a landlord cannot INSERT an already-verified row (forced to pending)", async () => {
    await as(db, "authenticated", OTHER);
    await db.exec(
      `INSERT INTO public.myr_verifications (user_id, kind, status, reviewed_by) VALUES ('${OTHER}','landlord','verified','${OTHER}')`,
    );
    await db.exec(`SET SESSION AUTHORIZATION postgres;`);
    const r = await db.query<{ status: string; reviewed_by: string | null }>(
      `SELECT status, reviewed_by FROM public.myr_verifications WHERE user_id='${OTHER}'`,
    );
    expect(r.rows[0]).toEqual({ status: "pending", reviewed_by: null });
  });

  it("the older verifications table is fixed by the same trigger", async () => {
    await db.exec(`SET SESSION AUTHORIZATION postgres;`);
    const r = await db.query<{ id: string }>(
      `INSERT INTO public.verifications DEFAULT VALUES RETURNING id`,
    );
    await as(db, "service_role", null); // service-role requests carry NO user sub
    await db.exec(`UPDATE public.verifications SET status='verified' WHERE id='${r.rows[0].id}'`);
  });
});

describe("storage bucket + publish policies", () => {
  it("creates a private myr-kyc bucket with size + mime limits (idempotent)", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE SCHEMA storage;
      CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
      CREATE TABLE storage.objects (bucket_id text, name text);
      CREATE FUNCTION storage.foldername(n text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(n,'/') $$;
      CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION public.is_admin(u uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
      INSERT INTO storage.buckets VALUES ('myr-kyc','myr-kyc',true,NULL,NULL);
    `);
    await db.exec(mig("20260920000001_myr_kyc_bucket.sql"));
    await db.exec(mig("20260920000001_myr_kyc_bucket.sql"));
    const r = await db.query<{
      public: boolean;
      file_size_limit: string;
      allowed_mime_types: string[];
    }>(
      `SELECT public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='myr-kyc'`,
    );
    expect(r.rows[0].public).toBe(false);
    expect(Number(r.rows[0].file_size_limit)).toBe(5242880);
    expect(r.rows[0].allowed_mime_types).toContain("application/pdf");
  });

  it("anon sees a published property even when verification is unverified/pending", async () => {
    const db = new PGlite();
    await db.exec(`
      CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; GRANT anon TO authenticator;
      CREATE TABLE public.properties (id int PRIMARY KEY, is_public_listing boolean, verification_status text);
      CREATE TABLE public.rooms (id int PRIMARY KEY, property_id int, is_public boolean);
      ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY; ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "MYR public properties browse" ON public.properties FOR SELECT TO anon USING (is_public_listing = true AND verification_status = 'verified');
      GRANT SELECT ON public.properties, public.rooms TO anon;
      INSERT INTO public.properties VALUES (1,true,'unverified'),(2,false,'verified');
      INSERT INTO public.rooms VALUES (10,1,true),(20,2,true);
    `);
    await db.exec(mig("20260920000002_publish_independent_of_verification.sql"));
    await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE anon;`);
    const p = await db.query<{ id: number }>(`SELECT id FROM public.properties`);
    const r = await db.query<{ id: number }>(`SELECT id FROM public.rooms`);
    expect(p.rows.map((x) => x.id)).toEqual([1]); // published, unverified -> visible; unpublished stays hidden
    expect(r.rows.map((x) => x.id)).toEqual([10]);
  });
});
