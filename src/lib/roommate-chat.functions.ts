import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const uuid = z.string().uuid();
const core = () => import("@/lib/roommate-chat.core.server");

/** Ask a match to chat. Both people must have opted in to roommate matching. */
export const startRoommateChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ otherUserId: uuid, message: z.string().trim().min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => (await core()).startChat(context.userId, data.otherUserId, data.message));

export const listRoommateThreads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => (await core()).listThreads(context.userId));

export const getRoommateThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await core()).getThread(context.userId, data.threadId));

export const sendRoommateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: uuid, body: z.string().trim().min(1).max(2000) }).parse(d))
  .handler(async ({ data, context }) => (await core()).sendMessage(context.userId, data.threadId, data.body));

export const respondRoommateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: uuid, decision: z.enum(["accept", "decline", "block"]) }).parse(d))
  .handler(async ({ data, context }) => (await core()).respond(context.userId, data.threadId, data.decision));

/** Drops a "video call started" card in the chat so the other person can join the same private room. */
export const startRoommateCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ threadId: uuid }).parse(d))
  .handler(async ({ data, context }) => (await core()).startCall(context.userId, data.threadId));
