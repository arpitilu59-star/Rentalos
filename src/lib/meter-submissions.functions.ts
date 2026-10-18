/* eslint-disable @typescript-eslint/no-explicit-any -- joined rows from the service client */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getAdmin } from "@/lib/whatsapp/db";

/** Landlord: tenant-submitted meter readings waiting for approval (with a short-lived photo link). */
export const listPendingMeterSubmissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = (await getAdmin()) as any;
    const { data, error } = await admin
      .from("meter_submissions")
      .select("id, reading, note, photo_path, created_at, tenants(name), rooms(room_number)")
      .eq("owner_id", context.userId)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(50);
    if (error) throw new Error("Couldn't load tenant readings.");
    const out = [];
    for (const s of (data ?? []) as any[]) {
      let photo: string | null = null;
      if (s.photo_path) {
        const { data: sig } = await admin.storage.from("meter-photos").createSignedUrl(s.photo_path, 600);
        photo = sig?.signedUrl ?? null;
      }
      out.push({
        id: s.id as string,
        reading: Number(s.reading),
        note: (s.note as string | null) ?? null,
        createdAt: s.created_at as string,
        tenant: (s.tenants?.name as string | undefined) ?? "Tenant",
        room: (s.rooms?.room_number as string | undefined) ?? "",
        photo,
      });
    }
    return out;
  });

export const decideMeterSubmission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        approve: z.boolean(),
        reading: z.number().min(0).max(99_999_999).optional(),
        note: z.string().trim().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = (await getAdmin()) as any;
    const { data: res, error } = await admin.rpc("decide_meter_submission", {
      _owner: context.userId,
      _id: data.id,
      _approve: data.approve,
      _reading: data.reading ?? null,
      _note: data.note ?? null,
    });
    if (error) throw new Error(error.message.replace(/^.*?ERROR:\s*/, "").slice(0, 200));
    try {
      const { data: s } = await admin.from("meter_submissions").select("submitted_by, reading, approved_reading").eq("id", data.id).maybeSingle();
      if (s?.submitted_by)
        await admin.from("myr_notifications").insert({
          user_id: s.submitted_by,
          kind: "meter_decided",
          title: data.approve ? "Meter reading approved" : "Meter reading rejected",
          body: data.approve
            ? `Your owner approved the reading (${Number(s.approved_reading)}). It will be used in your bill.`
            : `Your owner didn't accept the reading${data.note ? `: ${data.note}` : ". Please submit it again."}`,
          link: "/meter",
        });
    } catch {
      /* best-effort */
    }
    return res as { status: string };
  });
