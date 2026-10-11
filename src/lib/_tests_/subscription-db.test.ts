/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/**
 * Runs the REAL subscription migration against in-memory Postgres (PGlite)
 * with minimal stand-ins for Supabase (auth/storage/notify/automation).
 * Not a test against a live Supabase project.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const U1 = "00000000-0000-0000-0000-0000000000b1";
const U2 = "00000000-0000-0000-0000-0000000000b2";
const OLD = "00000000-0000-0000-0000-0000000000b3"; // pre-existing landlord (grandfathered)
const TENANT = "00000000-0000-0000-0000-0000000000c1";

async function as(db: PGlite, role: "service_role" | "authenticated" | "anon", uid: string | null) {
  await db.exec(`SET SESSION AUTHORIZATION postgres;`);
  await db.exec(
    `SELECT set_config('request.jwt.claim.role','${role}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false);`,
  );
  await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE ${role};`);
}
async function pg(db: PGlite) {
  await db.exec(`SET SESSION AUTHORIZATION postgres; RESET ROLE;`);
}
const q = async (db: PGlite, sql: string) => (await db.query<any>(sql)).rows;

let db: PGlite;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    CREATE ROLE authenticator LOGIN; CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    GRANT anon, authenticated, service_role TO authenticator;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role', true),'') $$;
    CREATE TABLE storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    CREATE TABLE storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(n text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(n,'/') $$;
    CREATE TABLE public.admin_users (user_id uuid, role text, active boolean);
    CREATE FUNCTION public.is_admin(_uid uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT EXISTS (SELECT 1 FROM public.admin_users WHERE user_id=_uid AND active) $$;
    CREATE TABLE public.admin_audit_logs (id uuid primary key default gen_random_uuid(), admin_user_id uuid, action text, target_type text, target_id text, metadata jsonb, created_at timestamptz default now());
    CREATE TABLE public.notes_log (uid uuid, kind text, title text);
    CREATE FUNCTION public.notify_user(u uuid, k text, t text, b text, l text) RETURNS void LANGUAGE sql AS $$ INSERT INTO public.notes_log VALUES (u,k,t) $$;
    CREATE TABLE public.slots (k text primary key);
    CREATE FUNCTION public.claim_automation_slot(a text, b uuid, c text, d text) RETURNS boolean LANGUAGE plpgsql AS $$ BEGIN INSERT INTO public.slots VALUES (a||b||c); RETURN true; EXCEPTION WHEN unique_violation THEN RETURN false; END $$;
    CREATE FUNCTION public.finish_automation_slot(a text, b uuid, c text, d text, e text, f jsonb) RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION public.is_trusted_db_session() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT coalesce(auth.role(),'')='service_role' OR session_user IN ('postgres','supabase_admin','service_role') $$;
    CREATE TABLE public.properties (id uuid primary key default gen_random_uuid(), owner_id uuid);
    CREATE TABLE public.rooms (id uuid primary key default gen_random_uuid(), owner_id uuid, property_id uuid, room_number text);
    CREATE TABLE public.tenants (id uuid primary key default gen_random_uuid(), owner_id uuid, name text, active boolean default true, tenant_user_id uuid, room_id uuid, lease_end_date date);
    CREATE TABLE public.bills (id uuid primary key default gen_random_uuid(), owner_id uuid, tenant_id uuid, room_id uuid, status text default 'due', archived boolean default false, due_date date, total_amount numeric, amount_paid numeric, last_reminded_at timestamptz);
    CREATE TABLE public.meter_readings (id uuid primary key default gen_random_uuid(), room_id uuid, reading numeric);
    CREATE TABLE public.deposits (id uuid primary key default gen_random_uuid(), owner_id uuid, tenant_id uuid);
    CREATE TABLE public.move_records (id uuid primary key default gen_random_uuid(), owner_id uuid, tenant_id uuid);
    CREATE TABLE public.maintenance_tickets (id uuid primary key default gen_random_uuid(), owner_id uuid, title text);
    CREATE TABLE public.subscriptions (id uuid primary key default gen_random_uuid(), landlord_id uuid unique, plan text, status text, started_at timestamptz default now(), expires_at timestamptz);
    CREATE TABLE public.myr_subscriptions (id uuid primary key default gen_random_uuid(), landlord_id uuid unique, plan text);
    GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public, auth, storage TO anon, authenticated, service_role;
    CREATE POLICY own_all ON public.tenants FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
    ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
    INSERT INTO public.admin_users VALUES ('${ADMIN}','root_owner',true);
    -- pre-existing data: OLD is a landlord from before this migration
    INSERT INTO public.properties (owner_id) VALUES ('${OLD}');
    INSERT INTO public.tenants (owner_id, name) VALUES ('${OLD}','Old tenant');
    INSERT INTO public.subscriptions (landlord_id, plan, status) VALUES ('${U2}','pro','active');
  `);
  await db.exec(mig("20260921000000_subscription_system.sql"));
  await db.exec(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;`);
});

const svc = async (sql: string) => {
  await as(db, "service_role", null);
  return q(db, sql);
};

describe("catalog and seed", () => {
  it("has exactly three plans and the approved matrix", async () => {
    await pg(db);
    const plans = await q(
      db,
      `select code, price_inr::int p from subscription_plans order by price_inr`,
    );
    expect(plans).toEqual([
      { code: "FREE", p: 0 },
      { code: "RENTDESK", p: 69 },
      { code: "RENTALOS_MANAGEMENT", p: 169 },
    ]);
    await expect(
      db.exec(`insert into subscription_plans (code,name,price_inr) values ('GOLD','Gold',1)`),
    ).rejects.toThrow();
  });
  it("migrated an active legacy paid sub and grandfathered existing landlords for 90 days", async () => {
    await pg(db);
    const u2 = await q(
      db,
      `select p.code, s.source from user_subscriptions s join subscription_plans p on p.id=s.plan_id where user_id='${U2}'`,
    );
    expect(u2[0]).toEqual({ code: "RENTDESK", source: "legacy_migration" });
    const old = await q(
      db,
      `select p.code, s.source, (s.expires_at - now()) between interval '89 days' and interval '91 days' as ok from user_subscriptions s join subscription_plans p on p.id=s.plan_id where user_id='${OLD}'`,
    );
    expect(old[0]).toMatchObject({ code: "RENTDESK", source: "legacy_grandfather", ok: true });
  });
});

describe("entitlement resolution", () => {
  it("new user is FREE: browse yes, rentdesk no", async () => {
    await pg(db);
    const r = await q(
      db,
      `select has_entitlement('${U1}','marketplace_browse') b, has_entitlement('${U1}','rentdesk_core') r, entitlement_limit('${U1}','max_properties') mp`,
    );
    expect(r[0]).toEqual({ b: true, r: false, mp: 1 });
  });
  it("override beats plan; expiry returns to plan; disable override beats paid plan; latest wins", async () => {
    await pg(db);
    await db.exec(
      `select admin_set_override('${ADMIN}','${U1}','ai_meter_ocr',true,now()+interval '1 day','trial')`,
    );
    expect((await q(db, `select has_entitlement('${U1}','ai_meter_ocr') v`))[0].v).toBe(true);
    await db.exec(
      `update entitlement_overrides set expires_at = now() - interval '1 minute' where user_id='${U1}'`,
    );
    expect((await q(db, `select has_entitlement('${U1}','ai_meter_ocr') v`))[0].v).toBe(false);
    // disable on a paid plan
    expect((await q(db, `select has_entitlement('${OLD}','rentdesk_core') v`))[0].v).toBe(true);
    await db.exec(
      `select admin_set_override('${ADMIN}','${OLD}','rentdesk_core',false,null,'abuse')`,
    );
    expect((await q(db, `select has_entitlement('${OLD}','rentdesk_core') v`))[0].v).toBe(false);
    await db.exec(
      `select admin_set_override('${ADMIN}','${OLD}','rentdesk_core',true,null,'resolved')`,
    );
    expect((await q(db, `select has_entitlement('${OLD}','rentdesk_core') v`))[0].v).toBe(true);
    expect(
      (
        await q(
          db,
          `select count(*)::int n from entitlement_overrides where user_id='${OLD}' and revoked_at is null`,
        )
      )[0].n,
    ).toBe(1);
  });
  it("requires reason and a real feature key", async () => {
    await pg(db);
    await expect(
      db.exec(`select admin_set_override('${ADMIN}','${U1}','ai_meter_ocr',true,null,'')`),
    ).rejects.toThrow(/reason/i);
    await expect(
      db.exec(`select admin_set_override('${ADMIN}','${U1}','nope',true,null,'x')`),
    ).rejects.toThrow(/Unknown feature/);
  });
  it("expiry is enforced lazily even if cron never ran, and grace days extend it", async () => {
    await pg(db);
    await db.exec(
      `update user_subscriptions set expires_at = now() - interval '1 hour' where user_id='${U2}'`,
    );
    expect((await q(db, `select has_entitlement('${U2}','rentdesk_core') v`))[0].v).toBe(false);
    expect((await q(db, `select get_effective_entitlements('${U2}')->>'status' s`))[0].s).toBe(
      "EXPIRED",
    );
    await db.exec(`update subscription_settings set grace_days = 2`);
    expect((await q(db, `select has_entitlement('${U2}','rentdesk_core') v`))[0].v).toBe(true);
    await db.exec(`update subscription_settings set grace_days = 0`);
    await db.exec(`select cron_subscription_expiry()`);
    expect(
      (await q(db, `select status from user_subscriptions where user_id='${U2}'`))[0].status,
    ).toBe("EXPIRED");
    expect(
      (
        await q(
          db,
          `select count(*)::int n from notes_log where uid='${U2}' and kind='subscription_expired'`,
        )
      )[0].n,
    ).toBe(1);
  });
});

describe("pricing and payments", () => {
  it("computes payable server-side with fixed / percent / free / best-of", async () => {
    await pg(db);
    const base = (await q(db, `select compute_payable('${U1}','RENTDESK') c`))[0].c;
    expect(Number(base.payable)).toBe(69);
    await db.exec(
      `select admin_set_discount('${ADMIN}','${U1}','RENTDESK','fixed',20,1,null,null,'promo')`,
    );
    expect(Number((await q(db, `select compute_payable('${U1}','RENTDESK') c`))[0].c.payable)).toBe(
      49,
    );
    await db.exec(
      `select admin_set_discount('${ADMIN}','${U1}','RENTDESK','percent',50,1,null,null,'promo2')`,
    );
    expect(Number((await q(db, `select compute_payable('${U1}','RENTDESK') c`))[0].c.payable)).toBe(
      34.5,
    );
    await db.exec(
      `select admin_set_discount('${ADMIN}','${U1}','RENTDESK','free',null,1,null,null,'vip')`,
    );
    expect(Number((await q(db, `select compute_payable('${U1}','RENTDESK') c`))[0].c.payable)).toBe(
      0,
    );
    expect(
      Number((await q(db, `select compute_payable('${U1}','RENTALOS_MANAGEMENT') c`))[0].c.payable),
    ).toBe(169);
    await db.exec(`update subscription_discounts set active=false where user_id='${U1}'`);
  });
  it("payment: pending does NOT grant access; reject keeps FREE; approve activates 1 month; duplicate pending/txn blocked", async () => {
    await pg(db);
    await expect(
      db.exec(`select submit_subscription_payment('${U1}','RENTDESK','', 69, null, null)`),
    ).rejects.toThrow(/transaction/i);
    await expect(
      db.exec(
        `select submit_subscription_payment('${U1}','RENTDESK','TXN12345', 69, 'other/x.png', null)`,
      ),
    ).rejects.toThrow(/screenshot/i);
    await expect(
      db.exec(
        `select submit_subscription_payment('${U1}','FREE','TXN12345', 0, '${U1}/a.png', null)`,
      ),
    ).rejects.toThrow(/cannot be purchased/i);
    const r = (
      await q(
        db,
        `select submit_subscription_payment('${U1}','RENTDESK','TXN12345', 1, '${U1}/a.png', null) r`,
      )
    )[0].r;
    expect(r.status).toBe("PENDING_REVIEW");
    expect(Number(r.payable)).toBe(69); // client claimed 1; server price wins
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(false);
    await expect(
      db.exec(
        `select submit_subscription_payment('${U1}','RENTDESK','TXN99999', 69, '${U1}/b.png', null)`,
      ),
    ).rejects.toThrow(/already have a payment/);
    const id = r.payment_id;
    await expect(
      db.exec(`select decide_subscription_payment('${ADMIN}','${id}','REJECTED','')`),
    ).rejects.toThrow(/note/i);
    await db.exec(`select decide_subscription_payment('${ADMIN}','${id}','REJECTED','blurry')`);
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(false);
    await expect(
      db.exec(`select decide_subscription_payment('${ADMIN}','${id}','APPROVED',null)`),
    ).rejects.toThrow(/already decided/);
    // resubmit with a fresh txn -> approve
    const r2 = (
      await q(
        db,
        `select submit_subscription_payment('${U1}','RENTDESK','TXN55555', 69, '${U1}/c.png', null) r`,
      )
    )[0].r;
    await expect(
      db.exec(
        `select submit_subscription_payment('${U2}','RENTDESK','txn55555', 69, '${U2}/c.png', null)`,
      ),
    ).rejects.toThrow(); // duplicate txn
    await db.exec(
      `select decide_subscription_payment('${ADMIN}','${r2.payment_id}','APPROVED','ok')`,
    );
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(true);
    const e = (
      await q(
        db,
        `select (expires_at - now()) between interval '27 days' and interval '32 days' ok from user_subscriptions where user_id='${U1}'`,
      )
    )[0];
    expect(e.ok).toBe(true);
    expect(
      (
        await q(
          db,
          `select count(*)::int n from notes_log where uid='${U1}' and kind='subscription_activated'`,
        )
      )[0].n,
    ).toBe(1);
  });
  it("approved payment of an active plan extends from current expiry; discount periods consumed", async () => {
    await pg(db);
    const before = (
      await q(db, `select expires_at e from user_subscriptions where user_id='${U1}'`)
    )[0].e as Date;
    await db.exec(
      `select admin_set_discount('${ADMIN}','${U1}','RENTDESK','percent',10,1,null,null,'loyal')`,
    );
    const r = (
      await q(
        db,
        `select submit_subscription_payment('${U1}','RENTDESK','TXN77777', 63, '${U1}/d.png', null) r`,
      )
    )[0].r;
    expect(Number(r.payable)).toBeCloseTo(62.1, 1);
    await db.exec(
      `select decide_subscription_payment('${ADMIN}','${r.payment_id}','APPROVED',null)`,
    );
    const after = (
      await q(db, `select expires_at e from user_subscriptions where user_id='${U1}'`)
    )[0].e as Date;
    expect(after.getTime()).toBeGreaterThan(before.getTime() + 27 * 86400000);
    expect(
      (await q(db, `select periods_used u from subscription_discounts where reason='loyal'`))[0].u,
    ).toBe(1);
    expect(Number((await q(db, `select compute_payable('${U1}','RENTDESK') c`))[0].c.payable)).toBe(
      69,
    ); // single-month discount used up
  });
  it("admin actions: need reason, suspend blocks, reactivate restores, cancel, extend/reduce", async () => {
    await pg(db);
    await expect(
      db.exec(`select admin_apply_subscription_action('${ADMIN}','${U1}','suspend',null,null,'')`),
    ).rejects.toThrow(/reason/i);
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','suspend',null,null,'chargeback')`,
    );
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(false);
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','reactivate',null,null,'ok')`,
    );
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(true);
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','reduce',null,12,'oops')`,
    );
    expect(
      (await q(db, `select status from user_subscriptions where user_id='${U1}'`))[0].status,
    ).toBe("EXPIRED");
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','extend',null,2,'goodwill')`,
    );
    expect(
      (await q(db, `select status from user_subscriptions where user_id='${U1}'`))[0].status,
    ).toBe("ACTIVE");
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','assign','RENTALOS_MANAGEMENT',null,'partner')`,
    );
    expect((await q(db, `select entitlement_limit('${U1}','max_properties') l`))[0].l).toBeNull();
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','cancel',null,null,'asked')`,
    );
    expect((await q(db, `select has_entitlement('${U1}','rentdesk_core') v`))[0].v).toBe(false);
  });
});

describe("security", () => {
  it("browser roles cannot execute mutating functions or read other users' data", async () => {
    await as(db, "authenticated", U1);
    await expect(
      db.exec(
        `select admin_apply_subscription_action('${U1}','${U1}','assign','RENTALOS_MANAGEMENT',null,'self')`,
      ),
    ).rejects.toThrow(/permission denied/i);
    await expect(
      db.exec(`select decide_subscription_payment('${U1}', gen_random_uuid(),'APPROVED',null)`),
    ).rejects.toThrow(/permission denied/i);
    await expect(db.exec(`select has_entitlement('${U2}','rentdesk_core')`)).rejects.toThrow(
      /permission denied/i,
    );
  });
  it("users cannot write subscription tables from the browser (no grants, no policies)", async () => {
    for (const t of [
      "user_subscriptions",
      "subscription_payments",
      "entitlement_overrides",
      "subscription_discounts",
      "subscription_settings",
    ]) {
      await as(db, "authenticated", U1);
      await expect(db.exec(`delete from public.${t}`)).rejects.toThrow(/permission denied/i);
      await as(db, "authenticated", U1);
      await expect(db.exec(`update public.${t} set id = id`)).rejects.toThrow(/permission denied/i);
    }
    await as(db, "authenticated", U1);
    await expect(
      db.exec(
        `insert into public.user_subscriptions (user_id, plan_id, status) select '${U1}', id, 'ACTIVE' from public.subscription_plans limit 1`,
      ),
    ).rejects.toThrow(/permission denied/i);
  });
  it("users see only their own subscription and payments", async () => {
    await as(db, "authenticated", U2);
    const s = await q(db, `select user_id from user_subscriptions`);
    expect(s.every((r) => r.user_id === U2)).toBe(true);
    const p = await q(db, `select user_id from subscription_payments`);
    expect(p.every((r) => r.user_id === U2)).toBe(true);
  });
  it("legacy self-activation is closed", async () => {
    await as(db, "authenticated", U1);
    await expect(
      db.exec(
        `insert into public.subscriptions (landlord_id, plan, status) values ('${U1}','pro','active')`,
      ),
    ).rejects.toThrow();
  });
  it("audit log is immutable and records actor/target/reason", async () => {
    await pg(db);
    const rows = await q(
      db,
      `select action, admin_user_id, metadata from admin_audit_logs where action='subscription_cancelled'`,
    );
    expect(rows[0].admin_user_id).toBe(ADMIN);
    expect(rows[0].metadata.reason).toBe("asked");
    expect(rows[0].metadata.target_user_id).toBe(U1);
    await expect(db.exec(`update admin_audit_logs set action='x'`)).rejects.toThrow(/immutable/);
    await expect(db.exec(`delete from admin_audit_logs`)).rejects.toThrow(/immutable/);
  });
});

describe("database-level RentDesk enforcement (read-only after expiry)", () => {
  it("expired/free owner: can READ own data, cannot write; service role and tenants unaffected", async () => {
    await pg(db);
    await db.exec(`insert into public.tenants (owner_id, name) values ('${U1}','Seeded')`); // postgres/trusted
    await as(db, "authenticated", U1); // cancelled -> FREE
    expect((await q(db, `select count(*)::int n from tenants`))[0].n).toBeGreaterThanOrEqual(1);
    await expect(
      db.exec(`insert into public.tenants (owner_id, name) values ('${U1}','New')`),
    ).rejects.toThrow(/RentDesk plan required/);
    await expect(
      db.exec(`update public.tenants set name='Edited' where owner_id='${U1}'`),
    ).rejects.toThrow(/RentDesk plan required/);
    await as(db, "service_role", null);
    await expect(
      db.exec(
        `insert into public.maintenance_tickets (owner_id, title) values ('${U1}','tenant raised')`,
      ),
    ).resolves.not.toThrow();
    await as(db, "authenticated", TENANT);
    await expect(
      db.exec(
        `insert into public.maintenance_tickets (owner_id, title) values ('${U1}','tenant raised 2')`,
      ),
    ).resolves.not.toThrow();
  });
  it("meter_readings (no owner_id column) is enforced through the room owner", async () => {
    await pg(db);
    const rid = (await q(db, `insert into rooms (owner_id) values ('${U1}') returning id`))[0].id;
    await as(db, "authenticated", U1);
    await expect(
      db.exec(`insert into public.meter_readings (room_id, reading) values ('${rid}', 5)`),
    ).rejects.toThrow(/RentDesk plan required/);
    await pg(db);
    await db.exec(
      `select admin_apply_subscription_action('${ADMIN}','${U1}','assign','RENTDESK',1,'back')`,
    );
    await as(db, "authenticated", U1);
    await expect(
      db.exec(`insert into public.meter_readings (room_id, reading) values ('${rid}', 5)`),
    ).resolves.not.toThrow();
    await expect(
      db.exec(`insert into public.tenants (owner_id, name) values ('${U1}','Allowed now')`),
    ).resolves.not.toThrow();
  });
  it("plan limits: RentDesk allows 10 properties, FREE only 1", async () => {
    await pg(db);
    const F = "00000000-0000-0000-0000-0000000000f1";
    await as(db, "authenticated", F);
    await expect(
      db.exec(`insert into public.properties (owner_id) values ('${F}')`),
    ).resolves.not.toThrow();
    await expect(
      db.exec(`insert into public.properties (owner_id) values ('${F}')`),
    ).rejects.toThrow(/allows 1 properties/);
  });
});

describe("automation gating", () => {
  it("rent reminders only run for owners with rent_reminders", async () => {
    await pg(db);
    const T1 = "00000000-0000-0000-0000-0000000000d1";
    const free = "00000000-0000-0000-0000-0000000000f2";
    const tid1 = (
      await q(
        db,
        `insert into tenants (owner_id, name, tenant_user_id) values ('${U1}','A','${T1}') returning id`,
      )
    )[0].id;
    const tid2 = (
      await q(
        db,
        `insert into tenants (owner_id, name, tenant_user_id) values ('${free}','B','${T1}') returning id`,
      )
    )[0].id;
    await db.exec(
      `insert into bills (owner_id, tenant_id, due_date, total_amount, amount_paid) values ('${U1}','${tid1}', current_date, 100, 0), ('${free}','${tid2}', current_date, 100, 0)`,
    );
    await db.exec(`select cron_bill_reminders()`);
    const n = (await q(db, `select count(*)::int n from notes_log where kind='RENT_DUE'`))[0].n;
    expect(n).toBe(1);
  });
});
