import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const L = "00000000-0000-0000-0000-000000000011",
  L2 = "00000000-0000-0000-0000-000000000012";
const T = "00000000-0000-0000-0000-000000000021",
  T2 = "00000000-0000-0000-0000-000000000022";
let db: PGlite;
// Deliberately limited fixtures: these tests execute the actual new migration functions and RLS.
const q = async (sql: string) => (await db.query<Record<string, unknown>>(sql)).rows;
const pg = () => db.exec("SET SESSION AUTHORIZATION postgres; RESET ROLE;");
async function as(role: string, id = "") {
  await pg();
  await db.exec(
    `select set_config('request.jwt.claim.sub','${id}',false); SET SESSION AUTHORIZATION authenticator; SET ROLE ${role};`,
  );
}
async function fixture(auto = false) {
  await pg();
  const room = String(
    (
      await q(
        `insert into rooms(owner_id,room_number,rent_amount,capacity,is_public) values('${L}','101',10000,1,true) returning id`,
      )
    )[0].id,
  );
  await db.exec(
    `insert into room_offer_settings(room_id,owner_id,offers_enabled,min_rent,auto_approve) values('${room}','${L}',true,8000,${auto})`,
  );
  const booking = async (user = T) =>
    String(
      (
        await q(
          `insert into bookings(room_id,landlord_id,tenant_user_id,tenant_name,tenant_mobile,tenant_email) values('${room}','${L}','${user}','Tenant','9999999999','test@example.com') returning id`,
        )
      )[0].id,
    );
  return { room, booking };
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
 create role authenticator login; create role anon; create role authenticated; create role service_role bypassrls;
 grant anon,authenticated,service_role to authenticator;
 create schema auth; create table auth.users(id uuid primary key);
 insert into auth.users values('${L}'),('${L2}'),('${T}'),('${T2}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function is_admin(uuid) returns boolean language sql stable as $$ select false $$;
 create function tenant_verified(uuid) returns boolean language sql stable as $$ select $1 in ('${T}'::uuid,'${T2}'::uuid) $$;
 create table rooms(id uuid primary key default gen_random_uuid(),owner_id uuid,room_number text,rent_amount numeric,capacity int,is_public boolean,myr_available boolean default true,property_id uuid,myr_photos text[] default '{}');
 create table bookings(id uuid primary key default gen_random_uuid(),room_id uuid,property_id uuid,landlord_id uuid,tenant_user_id uuid,tenant_name text,tenant_mobile text,tenant_email text,message text,status text default 'pending',tenant_id uuid,decided_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());
 create table properties(id uuid primary key default gen_random_uuid(),owner_id uuid);
 create table bills(id uuid primary key default gen_random_uuid(),owner_id uuid,tenant_id uuid,rent_amount numeric,bill_kind text default 'monthly',total_amount numeric,amount_paid numeric default 0,status text default 'unpaid',archived boolean default false,due_date date,paid_at timestamptz);
 create table payments(owner_id uuid,verification_status text);
 create table meter_submissions(owner_id uuid,status text);
 create table maintenance_tickets(owner_id uuid,status text);
 create table tenants(id uuid primary key default gen_random_uuid(),owner_id uuid,room_id uuid,name text,phone text,email text,persons int,move_in_date date,rent_share numeric,active boolean,tenant_user_id uuid,tenant_code text);
 create function generate_tenant_code() returns text language sql as $$ select gen_random_uuid()::text $$;
 create function terms_reaccept_status(uuid) returns jsonb language sql as $$ select '{"needs":false}'::jsonb $$;
 create table booking_terms_acceptances(booking_id uuid,snapshot jsonb,accepted_at timestamptz default now());
 create function record_terms_acceptance(uuid,uuid,jsonb,boolean) returns jsonb language plpgsql as $$ begin
 if $3->>'valid'='false' then raise exception 'TERMS_REQUIRED';end if;
 insert into booking_terms_acceptances(booking_id,snapshot) values($2,'{"terms":"accepted"}');return '{}';end $$;
 create table app_saved_rooms(user_id uuid default auth.uid(),room_id uuid,primary key(user_id,room_id));
 alter table app_saved_rooms enable row level security;
 create policy own on app_saved_rooms for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
 create table live_feed_videos(id uuid primary key default gen_random_uuid(),room_id uuid,verification_status text,processing_status text,duration_seconds int,created_at timestamptz default now());
 create table admin_users(user_id uuid,active boolean);
 create table myr_notifications(id uuid primary key default gen_random_uuid(),user_id uuid,kind text,title text,body text,link text);
 create function notify_user(uuid,text,text,text,text) returns void language sql as $$ insert into myr_notifications(user_id,kind,title,body,link) values($1,$2,$3,$4,$5) $$;
 create table automation_runs(job text,entity_id uuid,period_key text,primary key(job,entity_id,period_key));
 create function claim_automation_slot(text,uuid,text,text default null) returns boolean language plpgsql as $$ begin insert into automation_runs values($1,$2,$3);return true;exception when unique_violation then return false;end $$;
 create function finish_automation_slot(text,uuid,text,text,text default null,jsonb default '{}') returns void language sql as $$ select $$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 grant all on all tables in schema public to authenticated,service_role;
 `);
  for (const file of [
    "20261115000000_tenant_offers.sql",
    "20261120000000_room_insights_support.sql",
    "20261120000001_offer_completion.sql",
    "20261120000002_dashboard_totals.sql",
    "20261122000000_negotiated_bills_monitor.sql",
  ])
    await db.exec(readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8"));
  await db.exec("update room_insight_rollout set enabled=true");
});
afterAll(async () => {
  await db?.close();
});

describe("engagement privacy and integrity", () => {
  it("deduplicates refreshes and excludes owner and private-room views", async () => {
    const { room } = await fixture();
    const key = "a".repeat(64);
    await db.exec(
      `select record_room_engagement('${room}','${key}','${T}','view'); select record_room_engagement('${room}','${key}','${T}','view');select record_room_engagement('${room}','${"b".repeat(64)}','${L}','view');`,
    );
    expect(
      (await q(`select count(*)::int as n from room_views where room_id='${room}'`))[0].n,
    ).toBe(1);
    await db.exec(
      `update rooms set is_public=false where id='${room}';select record_room_engagement('${room}','${"c".repeat(64)}','${T2}','view');`,
    );
    expect(
      (await q(`select count(*)::int as n from room_views where room_id='${room}'`))[0].n,
    ).toBe(1);
  });
  it("never exposes raw viewers or another owner's totals through table RLS", async () => {
    await as("authenticated", L);
    await expect(q("select * from room_views")).rejects.toThrow(/permission denied/);
    await expect(q(`select * from room_insight_counts('${L2}',7)`)).rejects.toThrow(
      /permission denied/,
    );
    await as("authenticated", T);
    await expect(q("select * from room_save_events")).rejects.toThrow(/permission denied/);
    await expect(q("select * from support_queries")).rejects.toThrow(/permission denied/);
  });
  it("only counts completion after the verified video's duration and once a day", async () => {
    const { room } = await fixture();
    const key = "d".repeat(64);
    await db.exec(
      `insert into live_feed_videos(room_id,verification_status,processing_status,duration_seconds) values('${room}','verified','ready',20);select record_room_engagement('${room}','${key}','${T}','view');select record_room_engagement('${room}','${key}','${T}','video_complete');`,
    );
    expect(
      (await q(`select video_completed_at from room_views where room_id='${room}'`))[0]
        .video_completed_at,
    ).toBeNull();
    await db.exec(
      `update room_views set first_seen_at=now()-interval '25 seconds' where room_id='${room}';select record_room_engagement('${room}','${key}','${T}','video_complete');select record_room_engagement('${room}','${key}','${T}','video_complete');`,
    );
    expect(
      (
        await q(
          `select video_completions from room_insight_counts('${L}',7) where room_id='${room}'`,
        )
      )[0].video_completions,
    ).toBe(1);
  });
  it("save/un-save spam counts once and limits are atomic", async () => {
    const { room } = await fixture();
    await as("authenticated", T);
    await db.exec(
      `insert into app_saved_rooms values('${T}','${room}');delete from app_saved_rooms where room_id='${room}';insert into app_saved_rooms values('${T}','${room}');`,
    );
    await pg();
    expect(
      (await q(`select count(*)::int as n from room_save_events where room_id='${room}'`))[0].n,
    ).toBe(1);
    expect(
      (await q(`select consume_request_limit('test','${"e".repeat(64)}',1,3600) as ok`))[0].ok,
    ).toBe(true);
    expect(
      (await q(`select consume_request_limit('test','${"e".repeat(64)}',1,3600) as ok`))[0].ok,
    ).toBe(false);
  });
});

describe("offer commitment and money", () => {
  it("hides floors from both tenants and unrelated landlords", async () => {
    const { room } = await fixture();
    for (const user of [T, T2, L2]) {
      await as("authenticated", user);
      expect(
        await q(`select min_rent from room_offer_settings where room_id='${room}'`),
      ).toHaveLength(0);
    }
    await as("authenticated", L);
    expect(
      (await q(`select min_rent from room_offer_settings where room_id='${room}'`))[0].min_rent,
    ).toBe("8000");
  });
  it("requires verification, cooldown, valid amounts and actual ownership", async () => {
    const { booking } = await fixture();
    const id = await booking();
    for (const amount of [0, 4999, 10000, 9000.5])
      await expect(q(`select offer_submit('${id}','${T}',${amount})`)).rejects.toThrow(/OFFER_/);
    await expect(q(`select offer_submit('${id}','${L2}',9000)`)).rejects.toThrow(/FORBIDDEN/);
    await q(`select offer_submit('${id}','${T}',9000)`);
    const again = await booking();
    await expect(q(`select offer_submit('${again}','${T}',8500)`)).rejects.toThrow(
      /OFFER_COOLDOWN/,
    );
    await expect(q(`select offer_decide('${id}','${L2}','approve')`)).rejects.toThrow(/FORBIDDEN/);
  });
  it("reserves one offer, expires competing offers, and keeps the agreed rent in the tenancy and agreement", async () => {
    const { room, booking } = await fixture();
    const id = await booking(),
      other = await booking(T2);
    await q(`select offer_submit('${id}','${T}',9000)`);
    await q(`select offer_submit('${other}','${T2}',8500)`);
    expect(
      (await q(`select tenant_mobile,tenant_email from bookings where id='${id}'`))[0],
    ).toEqual({ tenant_mobile: "", tenant_email: null });
    await as("authenticated", L);
    expect(await q(`select * from booking_offer_contacts where booking_id='${id}'`)).toHaveLength(
      0,
    );
    await pg();
    await q(`select offer_decide('${id}','${L}','approve')`);
    expect((await q(`select offer_status from bookings where id='${other}'`))[0].offer_status).toBe(
      "expired",
    );
    await expect(q(`select accept_room_booking('${id}','${L}',current_date,1)`)).rejects.toThrow(
      /OFFER_CONFIRM_REQUIRED/,
    );
    await q(`select confirm_room_offer('${id}','${T}',current_date)`);
    expect((await q(`select rent_share,phone from tenants where room_id='${room}'`))[0]).toEqual({
      rent_share: "9000",
      phone: "9999999999",
    });
    await as("authenticated", L);
    expect(
      (await q(`select tenant_mobile from booking_offer_contacts where booking_id='${id}'`))[0]
        .tenant_mobile,
    ).toBe("9999999999");
    await pg();
    expect(
      (await q(`select agreed_rent from booking_offer_confirmations where booking_id='${id}'`))[0]
        .agreed_rent,
    ).toBe("9000");
    await q(`select confirm_room_offer('${id}','${T}',current_date)`);
    expect((await q(`select count(*)::int as n from tenants where room_id='${room}'`))[0].n).toBe(
      1,
    );
  });
  it("counter approval and expiry release the room without changing existing tenants", async () => {
    const { booking } = await fixture();
    const id = await booking();
    await q(`select offer_submit('${id}','${T}',7000)`);
    await q(`select offer_decide('${id}','${L}','counter',8500)`);
    await q(`select offer_respond('${id}','${T}','accept')`);
    expect((await q(`select agreed_rent from bookings where id='${id}'`))[0].agreed_rent).toBe(
      "8500",
    );
    await db.exec(
      `update bookings set offer_expires_at=now()-interval '1 second' where id='${id}'`,
    );
    await expect(q(`select confirm_room_offer('${id}','${T}',current_date)`)).rejects.toThrow(
      /OFFER_EXPIRED/,
    );
    await q("select expire_booking_offers()");
    expect((await q(`select status from bookings where id='${id}'`))[0].status).toBe("cancelled");
  });
  it("untrusted clients cannot forge a confirmation or invoke service-only operations", async () => {
    const { booking } = await fixture();
    const id = await booking();
    await as("authenticated", T);
    await expect(
      q(`update bookings set offer_confirmed_at=now() where id='${id}'`),
    ).rejects.toThrow(/OFFER_FIELDS_LOCKED/);
    await expect(q(`select confirm_room_offer('${id}','${T}',current_date)`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("atomic creation, summaries and portfolio totals", () => {
  it("rolls the request and terms back when an offer or acknowledgement fails", async () => {
    const { room } = await fixture();
    const call = (amount: number, acks = "{}") =>
      q(
        `select create_room_offer_booking('${T}','${room}','Test tenant','9999999999',null,null,'${acks}',false,${amount})`,
      );
    await expect(call(4000)).rejects.toThrow(/OFFER_TOO_LOW/);
    await expect(call(8000, '{"valid":false}')).rejects.toThrow(/TERMS_REQUIRED/);
    expect(await q(`select id from bookings where room_id='${room}'`)).toHaveLength(0);
    await call(8000);
    expect(await q(`select id from bookings where room_id='${room}'`)).toHaveLength(1);
    await expect(call(8500)).rejects.toThrow(/OFFER_INVALID_STATE/);
  });
  it("auto approval expires safely and invalid confirmation rolls back every change", async () => {
    const { room, booking } = await fixture(true);
    const id = await booking();
    await q(`select offer_submit('${id}','${T}',8000)`);
    expect((await q(`select offer_status from bookings where id='${id}'`))[0].offer_status).toBe(
      "approved",
    );
    await expect(q(`select confirm_room_offer('${id}','${T}',current_date-1)`)).rejects.toThrow(
      /OFFER_MOVE_IN_INVALID/,
    );
    expect(
      (await q(`select offer_confirmed_at from bookings where id='${id}'`))[0].offer_confirmed_at,
    ).toBeNull();
    expect(
      await q(`select * from booking_offer_confirmations where booking_id='${id}'`),
    ).toHaveLength(0);
    await db.exec(`update bookings set offer_expires_at=now()-interval '1 hour' where id='${id}'`);
    const second = await booking(T2);
    await q(`select offer_submit('${second}','${T2}',8500)`);
    expect((await q(`select offer_status from bookings where id='${id}'`))[0].offer_status).toBe(
      "expired",
    );
    await q(`select confirm_room_offer('${second}','${T2}',current_date)`);
    expect((await q(`select rent_share from tenants where room_id='${room}'`))[0].rent_share).toBe(
      "8500",
    );
  });
  it("sends one portfolio summary per day and honors opt-out and retention", async () => {
    const { room } = await fixture();
    await db.exec(`insert into room_insight_preferences(owner_id,summary_frequency,signals_enabled) values('${L}','daily',false) on conflict(owner_id) do update set summary_frequency='daily',signals_enabled=false;
   insert into room_views(room_id,viewer_key,day) values('${room}','${"f".repeat(64)}',current_date),('${room}','${"f".repeat(64)}',current_date-91);`);
    const before = Number(
      (
        await q(
          `select count(*) as n from myr_notifications where user_id='${L}' and kind='room_insight_summary'`,
        )
      )[0].n,
    );
    await q("select run_room_insight_summaries()");
    await q("select run_room_insight_summaries()");
    expect(
      Number(
        (
          await q(
            `select count(*) as n from myr_notifications where user_id='${L}' and kind='room_insight_summary'`,
          )
        )[0].n,
      ) - before,
    ).toBe(1);
    expect(await q("select * from room_views where day<current_date-90")).toHaveLength(0);
    await db.exec(
      `delete from automation_runs where job='room_insights_daily';update room_insight_preferences set summary_frequency='off' where owner_id='${L}'`,
    );
    await q("select run_room_insight_summaries()");
    expect(
      Number(
        (
          await q(
            `select count(*) as n from myr_notifications where user_id='${L}' and kind='room_insight_summary'`,
          )
        )[0].n,
      ) - before,
    ).toBe(1);
  });
  it("includes more than 20 bills and excludes other landlords and archived bills", async () => {
    await pg();
    await db.exec(`insert into bills(owner_id,total_amount,due_date) select '${L}',100,current_date-1 from generate_series(1,25);
   insert into bills(owner_id,total_amount,archived) values('${L}',9999,true),('${L2}',8888,false)`);
    const totals = (await q(`select landlord_dashboard_totals('${L}') as total`))[0].total as {
      due: number;
      overdue: number;
    };
    expect(totals.due).toBe(2500);
    expect(totals.overdue).toBe(2500);
    await as("authenticated", L);
    await expect(q(`select landlord_dashboard_totals('${L2}')`)).rejects.toThrow(
      /permission denied/,
    );
  });
});

describe("negotiated monthly billing", () => {
  it("uses the agreed rent and rejects a tampered monthly bill, while old tenants stay unchanged", async () => {
    const { room, booking } = await fixture(true);
    const id = await booking();
    await q(`select offer_submit('${id}','${T}',8100)`);
    await q(`select confirm_room_offer('${id}','${T}',current_date)`);
    const tenant = String(
      (await q(`select tenant_id from bookings where id='${id}'`))[0].tenant_id,
    );
    await expect(
      q(
        `insert into bills(owner_id,tenant_id,rent_amount,total_amount) values('${L}','${tenant}',10000,10000)`,
      ),
    ).rejects.toThrow(/agreed/);
    await q(
      `insert into bills(owner_id,tenant_id,rent_amount,total_amount) values('${L}','${tenant}',8100,8100)`,
    );
    expect(
      (await q(`select rent_amount from bills where tenant_id='${tenant}'`))[0].rent_amount,
    ).toBe("8100");
    await expect(q(`update bills set rent_amount=1 where tenant_id='${tenant}'`)).rejects.toThrow(
      /agreed/,
    );
    const old = String(
      (
        await q(
          `insert into tenants(owner_id,room_id,rent_share) values('${L}','${room}',9500) returning id`,
        )
      )[0].id,
    );
    await q(
      `insert into bills(owner_id,tenant_id,rent_amount,total_amount) values('${L}','${old}',9500,9500)`,
    );
    expect((await q(`select rent_share from tenants where id='${old}'`))[0].rent_share).toBe(
      "9500",
    );
  });
});
