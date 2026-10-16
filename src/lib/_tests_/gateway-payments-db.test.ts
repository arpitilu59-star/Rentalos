/* eslint-disable @typescript-eslint/no-explicit-any -- test stubs */
/** Real gateway-payment SQL against in-memory Postgres (PGlite). Not a live Razorpay/Supabase test. */
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { verifyCheckoutSignature, verifyWebhookSignature, parseCapturedEvent } from "../razorpay.server";

const mig = (f: string) => readFileSync(join(process.cwd(), "supabase/migrations", f), "utf8");
const ADMIN = "00000000-0000-0000-0000-0000000000a1";
const U1 = "00000000-0000-0000-0000-0000000000b1";
const U2 = "00000000-0000-0000-0000-0000000000b2";
const U3 = "00000000-0000-0000-0000-0000000000b4";
const OLD = "00000000-0000-0000-0000-0000000000b3";
async function as(db: PGlite, role: "service_role" | "authenticated" | "anon", uid: string | null) {
  await db.exec(`SET SESSION AUTHORIZATION postgres;`);
  await db.exec(`SELECT set_config('request.jwt.claim.role','${role}',false), set_config('request.jwt.claim.sub','${uid ?? ""}',false);`);
  await db.exec(`SET SESSION AUTHORIZATION authenticator; SET ROLE ${role};`);
}
const q = async (sql: string) => (await db.query<any>(sql)).rows;

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
  await db.exec(mig("20260924000000_gateway_payments.sql"));
  await db.exec(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO postgres;`);
});

const pgq = async (sql: string) => { await db.exec(`SET SESSION AUTHORIZATION postgres; RESET ROLE;`); return q(sql); };
const svc = async (sql: string) => { await as(db, "service_role", null); return q(sql); };
const order = async (uid: string, plan: string, id: string) =>
  svc(`select public.create_gateway_payment('${uid}','${plan}','razorpay','${id}') r`);

describe("signature helpers", () => {
  it("verifies checkout + webhook signatures and rejects tampering", () => {
    const sig = createHmac("sha256", "sec").update("order_1|pay_1").digest("hex");
    expect(verifyCheckoutSignature("order_1", "pay_1", sig, "sec")).toBe(true);
    expect(verifyCheckoutSignature("order_1", "pay_2", sig, "sec")).toBe(false);
    expect(verifyCheckoutSignature("order_1", "pay_1", "", "sec")).toBe(false);
    const body = '{"a":1}';
    const w = createHmac("sha256", "wh").update(body).digest("hex");
    expect(verifyWebhookSignature(body, w, "wh")).toBe(true);
    expect(verifyWebhookSignature(body + " ", w, "wh")).toBe(false);
    expect(verifyWebhookSignature(body, w, undefined)).toBe(false);
    expect(verifyWebhookSignature(body, null, "wh")).toBe(false);
  });
  it("parses only captured events", () => {
    const ok = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 49900, status: "captured" } } } };
    expect(parseCapturedEvent(ok)).toEqual({ orderId: "order_1", paymentId: "pay_1", amountPaise: 49900 });
    expect(parseCapturedEvent({ ...ok, event: "payment.failed" })).toBeNull();
    expect(parseCapturedEvent({ event: "payment.captured", payload: {} })).toBeNull();
  });
});

describe("gateway settle", () => {
  it("is not callable by users", async () => {
    await as(db, "authenticated", U1);
    await expect(db.query(`select public.settle_gateway_payment('razorpay','x','y',100)`)).rejects.toThrow();
    await expect(db.query(`select public.create_gateway_payment('${U1}','RENTDESK','razorpay','z')`)).rejects.toThrow();
  });
  it("activates instantly on exact amount, and is idempotent", async () => {
    const code = (await pgq(`select code, price_inr from subscription_plans where code <> 'FREE' and active order by sort_order limit 1`))[0];
    const r = (await order(U1, code.code, "order_A"))[0].r;
    expect(Number(r.payable)).toBe(Number(code.price_inr));
    const paise = Math.round(Number(code.price_inr) * 100);
    const s1 = (await svc(`select public.settle_gateway_payment('razorpay','order_A','pay_A',${paise}) r`))[0].r;
    expect(s1.status).toBe("APPROVED");
    const sub = (await pgq(`select status, expires_at from user_subscriptions where user_id='${U1}'`))[0];
    expect(sub.status).toBe("ACTIVE");
    const exp1 = String(sub.expires_at);
    const s2 = (await svc(`select public.settle_gateway_payment('razorpay','order_A','pay_A',${paise}) r`))[0].r;
    expect(s2.status).toBe("ALREADY_APPLIED");
    expect(String((await pgq(`select expires_at from user_subscriptions where user_id='${U1}'`))[0].expires_at)).toBe(exp1);
    const p = (await pgq(`select status, gateway_payment_id, transaction_reference from subscription_payments where gateway_order_id='order_A'`))[0];
    expect(p).toMatchObject({ status: "APPROVED", gateway_payment_id: "pay_A", transaction_reference: "pay_A" });
    expect((await pgq(`select count(*)::int n from admin_audit_logs where action='payment_auto_approved'`))[0].n).toBe(1);
  });
  it("amount mismatch never activates; goes to manual review", async () => {
    const code = (await pgq(`select code from subscription_plans where code <> 'FREE' and active order by sort_order limit 1`))[0].code;
    await order(U3, code, "order_B");
    const s = (await svc(`select public.settle_gateway_payment('razorpay','order_B','pay_B',100) r`))[0].r;
    expect(s.status).toBe("AMOUNT_MISMATCH");
    const sub = await pgq(`select status from user_subscriptions where user_id='${U3}'`);
    expect(sub.length === 0 || sub[0].status !== "ACTIVE").toBe(true);
    expect((await pgq(`select status from subscription_payments where gateway_order_id='order_B'`))[0].status).toBe("PENDING_REVIEW");
  });
  it("unknown order is rejected", async () => {
    await expect(svc(`select public.settle_gateway_payment('razorpay','nope','pay_X',100)`)).rejects.toThrow(/Unknown order/);
  });
  it("a suspended account is routed to manual review, not auto-lifted", async () => {
    const plan = (await pgq(`select code, price_inr from subscription_plans where code <> 'FREE' and active order by sort_order limit 1`))[0];
    await pgq(`update user_subscriptions set status='SUSPENDED' where user_id='${OLD}'`);
    await order(OLD, plan.code, "order_C");
    const s = (await svc(`select public.settle_gateway_payment('razorpay','order_C','pay_C',${Math.round(Number(plan.price_inr) * 100)}) r`))[0].r;
    expect(s.status).toBe("SUSPENDED_REVIEW");
    expect((await pgq(`select status from user_subscriptions where user_id='${OLD}'`))[0].status).toBe("SUSPENDED");
  });
});
