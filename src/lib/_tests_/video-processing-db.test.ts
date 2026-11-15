import { describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const migration = readFileSync("supabase/migrations/20261114000000_video_processing.sql", "utf8");
describe("server-managed video processing fields", () => {
  it("allows ordinary uploads but only the service may publish processed assets", async () => {
    const db = new PGlite();
    try {
      await db.exec(`create role authenticated; create role service_role; create schema auth;
        create function auth.role() returns text language sql as $$ select current_user::text $$;
        grant usage on schema auth to authenticated, service_role;
        create table live_feed_videos(id int primary key, room_id uuid, created_at timestamptz default now(), verification_status text default 'pending');`);
      await db.exec(migration);
      await db.exec(`grant all on live_feed_videos to authenticated, service_role; set role authenticated;
        insert into live_feed_videos(id) values(1);`);
      await expect(
        db.exec(
          `update live_feed_videos set processing_status='ready',playback_path='fake.mp4' where id=1`,
        ),
      ).rejects.toThrow(/managed by the server/);
      await expect(
        db.exec(`insert into live_feed_videos(id,processing_status) values(2,'ready')`),
      ).rejects.toThrow(/managed by the server/);
      await db.exec(
        `reset role; set role service_role; update live_feed_videos set processing_status='ready',playback_path='valid.mp4' where id=1;`,
      );
      expect(
        (
          await db.query<{ processing_status: string }>(
            `select processing_status from live_feed_videos where id=1`,
          )
        ).rows[0].processing_status,
      ).toBe("ready");
    } finally {
      await db.close();
    }
  }, 30000);
});
