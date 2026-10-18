/**
 * REST layer for the Rentalos mobile app (/api/app/*). Web uses TanStack server functions, which a
 * native app can't call, so this exposes the same logic over plain JSON with Bearer-token auth.
 */
import { createClient } from "@supabase/supabase-js";

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

async function userFromRequest(request: Request): Promise<string | null> {
  const h = request.headers.get("authorization") ?? "";
  if (!h.startsWith("Bearer ")) return null;
  const token = h.slice(7).trim();
  if (!token || !process.env.SUPABASE_URL || !process.env.SUPABASE_PUBLISHABLE_KEY) return null;
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await sb.auth.getUser(token);
  return error || !data.user ? null : data.user.id;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown): string => {
  const s = str(v, 40);
  if (!UUID.test(s)) throw new Error("Invalid id.");
  return s;
};

export async function handleMobileApi(request: Request, path: string): Promise<Response> {
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  try {
    // Scheduler endpoint: shared secret, no user.
    if (path === "/api/app/push/dispatch") {
      const secret = process.env.PUSH_DISPATCH_SECRET || process.env.WHATSAPP_DISPATCH_SECRET;
      if (!secret) return json({ error: "Push dispatch not configured" }, 500);
      if (request.method !== "POST" || request.headers.get("authorization") !== `Bearer ${secret}`) return json({ error: "Unauthorized" }, 401);
      const { dispatchPendingPush } = await import("./push.server");
      return json(await dispatchPendingPush());
    }
    if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
    const me = await userFromRequest(request);
    if (!me) return json({ error: "Please sign in again." }, 401);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;

    if (path === "/api/app/push-token") {
      const token = str(body.token, 200);
      const platform = body.platform === "ios" ? "ios" : "android";
      const { isExpoToken } = await import("./push");
      if (!isExpoToken(token)) return json({ error: "Invalid push token." }, 400);
      const { getAdmin } = await import("./whatsapp/db");
      const admin = await getAdmin();
      await admin.from("push_tokens").upsert({ user_id: me, token, platform, last_seen_at: new Date().toISOString() }, { onConflict: "token" });
      return json({ ok: true });
    }

    if (path === "/api/app/home") {
      // Same ownership rules as the web tenant portal: linked by user id, mobile or email.
      const { getAdmin } = await import("./whatsapp/db");
      const admin = await getAdmin();
      const { data: u } = await admin.auth.admin.getUserById(me);
      const email = u?.user?.email?.toLowerCase() ?? null;
      const { data: prof } = await admin.from("profiles").select("mobile, full_name").eq("id", me).maybeSingle();
      const filters = [`tenant_user_id.eq.${me}`];
      if (prof?.mobile) filters.push(`phone.eq.${prof.mobile}`);
      if (email) filters.push(`email.ilike.${email}`);
      const { data: tenants } = await admin
        .from("tenants")
        .select("id, name, rent_share, active, rooms(room_number, rent_amount, properties(name, myr_city, city))")
        .or(filters.join(","))
        .eq("active", true);
      const ids = (tenants ?? []).map((t: { id: string }) => t.id);
      const { data: bills } = ids.length
        ? await admin
            .from("bills")
            .select("id, tenant_id, total_amount, amount_paid, due_date, status")
            .in("tenant_id", ids)
            .order("due_date", { ascending: true })
            .limit(60)
        : { data: [] };
      const unpaid = ((bills ?? []) as Array<{ total_amount: number | null; amount_paid: number | null; due_date: string; status: string | null }>).filter(
        (b) => (b.total_amount ?? 0) - (b.amount_paid ?? 0) > 0 && b.status !== "paid",
      );
      const { data: pending } = await admin
        .from("bookings")
        .select("id, status, created_at, rooms(room_number, rent_amount, properties(name, myr_city, city))")
        .eq("tenant_user_id", me)
        .in("status", ["pending", "rejected"])
        .order("created_at", { ascending: false })
        .limit(10);
      return json({
        name: (prof?.full_name as string | null) ?? null,
        tenancies: tenants ?? [],
        outstanding: unpaid.reduce((n, b) => n + ((b.total_amount ?? 0) - (b.amount_paid ?? 0)), 0),
        nextDue: unpaid[0] ?? null,
        pendingBookings: pending ?? [],
      });
    }

    if (path === "/api/app/roommate-profile") {
      const { getAdmin } = await import("./whatsapp/db");
      const admin = await getAdmin();
      if (body.save === true) {
        const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
        const pick = <T extends string>(v: unknown, ok: readonly T[]): T | null => (ok.includes(v as T) ? (v as T) : null);
        const age = num(body.age);
        const row = {
          user_id: me,
          display_name: str(body.display_name, 60) || null,
          age: age !== null && age >= 16 && age <= 90 ? Math.round(age) : null,
          gender: pick(body.gender, ["male", "female", "other"] as const),
          city: str(body.city, 80) || null,
          occupation: str(body.occupation, 120) || null,
          bio: str(body.bio, 300) || null,
          smoking: typeof body.smoking === "boolean" ? body.smoking : null,
          sleep_schedule: pick(body.sleep_schedule, ["early_bird", "night_owl"] as const),
          diet: pick(body.diet, ["veg", "non_veg", "vegan"] as const),
          budget_min: num(body.budget_min),
          budget_max: num(body.budget_max),
          looking_for_roommate: body.looking_for_roommate === true,
        };
        const { error } = await admin.from("myr_user_profiles").upsert(row, { onConflict: "user_id" });
        if (error) return json({ error: "Couldn't save your profile." }, 400);
      }
      const { data: mine } = await admin.from("myr_user_profiles").select("*").eq("user_id", me).maybeSingle();
      return json({ profile: mine ?? null });
    }

    if (path === "/api/app/roommate/matches") {
      const { getAdmin } = await import("./whatsapp/db");
      const { scoreMatch } = await import("./myr-roommate.functions");
      const admin = await getAdmin();
      const { data: mine } = await admin.from("myr_user_profiles").select("*").eq("user_id", me).maybeSingle();
      if (!mine || !mine.looking_for_roommate) return json({ matches: [], profile: mine ?? null });
      let q = admin
        .from("myr_user_profiles")
        .select("user_id, display_name, age, gender, city, occupation, bio, smoking, sleep_schedule, diet, budget_min, budget_max")
        .eq("looking_for_roommate", true)
        .neq("user_id", me);
      if (mine.city) q = q.eq("city", mine.city);
      const { data: cands } = await q.limit(200);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose rows, same as the web function
      const matches = ((cands ?? []) as any[])
        .map((c) => ({ ...c, ...scoreMatch(mine as any, c) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, 20);
      return json({ matches, profile: mine });
    }

    {
      const t = await import("./mobile-tenant.server");
      switch (path.slice("/api/app/".length)) {
        case "room/terms": return json(await t.roomTerms(uuid(body.room_id)));
        case "booking/create": return json(await t.createBookingFromApp(me, body));
        case "booking/list": return json(await t.myBookings(me));
        case "booking/cancel": return json(await t.cancelBooking(me, uuid(body.booking_id)));
        case "bills": return json(await t.myBills(me));
        case "pay/info": return json(await t.payInfo(me, uuid(body.bill_id)));
        case "pay/submit": return json(await t.submitProof(me, body));
        case "tickets": return json(await t.listTickets(me));
        case "tickets/create": return json(await t.createTicket(me, body));
      }
    }

    if (path.startsWith("/api/app/roommate/")) {
      const c = await import("./roommate-chat.core.server");
      switch (path.slice("/api/app/roommate/".length)) {
        case "start": {
          const msg = str(body.message, 500);
          if (!msg) return json({ error: "Write a message first." }, 400);
          return json(await c.startChat(me, uuid(body.otherUserId), msg));
        }
        case "threads":
          return json(await c.listThreads(me));
        case "thread":
          return json(await c.getThread(me, uuid(body.threadId)));
        case "send": {
          const msg = str(body.body, 2000);
          if (!msg) return json({ error: "Write a message first." }, 400);
          return json(await c.sendMessage(me, uuid(body.threadId), msg));
        }
        case "respond": {
          const d = body.decision;
          if (d !== "accept" && d !== "decline" && d !== "block") return json({ error: "Invalid decision." }, 400);
          return json(await c.respond(me, uuid(body.threadId), d));
        }
        case "call":
          return json(await c.startCall(me, uuid(body.threadId)));
      }
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Something went wrong";
    // Messages thrown by our own rules are user-safe (e.g. "This conversation is blocked.").
    return json({ error: msg.slice(0, 200) }, 400);
  }
}
