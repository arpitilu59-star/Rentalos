/** Roommate chat logic shared by the web (server functions) and the mobile app (REST). */
import { getAdmin } from "@/lib/whatsapp/db";
import { canSend, cleanMessage, maskContactDetails, videoRoomUrl, type ThreadStatus } from "@/lib/roommate-chat";

type Admin = Awaited<ReturnType<typeof getAdmin>>;
export type Thread = {
  id: string;
  requester_id: string;
  recipient_id: string;
  status: ThreadStatus;
  blocked_by: string | null;
  last_message: string | null;
  last_message_at: string;
};

async function loadThread(admin: Admin, id: string, userId: string): Promise<Thread> {
  const { data } = await admin.from("roommate_threads").select("*").eq("id", id).maybeSingle();
  const t = data as Thread | null;
  if (!t || (t.requester_id !== userId && t.recipient_id !== userId)) throw new Error("Conversation not found.");
  return t;
}

async function nameOf(admin: Admin, userId: string): Promise<string> {
  const { data } = await admin.from("myr_user_profiles").select("display_name").eq("user_id", userId).maybeSingle();
  if (data?.display_name) return data.display_name as string;
  const { data: p } = await admin.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  return ((p?.full_name as string | undefined)?.split(" ")[0]) || "A roommate";
}

async function notify(admin: Admin, userId: string, title: string, body: string) {
  try {
    await admin.from("myr_notifications").insert({ user_id: userId, kind: "roommate_chat", title, body, link: "/myr/roommate-chat" });
  } catch {
    /* best effort */
  }
}

export async function startChat(me: string, otherUserId: string, message: string) {
  if (otherUserId === me) throw new Error("You can't chat with yourself.");
  const admin = await getAdmin();
  const { data: profs } = await admin.from("myr_user_profiles").select("user_id, looking_for_roommate").in("user_id", [me, otherUserId]);
  const ok = (id: string) => (profs ?? []).some((p: { user_id: string; looking_for_roommate: boolean }) => p.user_id === id && p.looking_for_roommate);
  if (!ok(me)) throw new Error("Turn on 'Looking for a roommate' in your profile first.");
  if (!ok(otherUserId)) throw new Error("This person is no longer looking for a roommate.");
  const { data: existing } = await admin
    .from("roommate_threads")
    .select("*")
    .or(`and(requester_id.eq.${me},recipient_id.eq.${otherUserId}),and(requester_id.eq.${otherUserId},recipient_id.eq.${me})`)
    .maybeSingle();
  if (existing) {
    const t = existing as Thread;
    if (t.status === "blocked") throw new Error("This conversation is blocked.");
    if (t.status === "declined" && t.requester_id === me) throw new Error("This person declined your request.");
    return { threadId: t.id, status: t.status };
  }
  const msg = maskContactDetails(cleanMessage(message));
  const { data: row, error } = await admin
    .from("roommate_threads")
    .insert({ requester_id: me, recipient_id: otherUserId, status: "pending", last_message: msg })
    .select("id")
    .single();
  if (error || !row) throw new Error("Couldn't send the request. Please try again.");
  await admin.from("roommate_messages").insert({ thread_id: row.id, sender_id: me, body: msg });
  await notify(admin, otherUserId, "New roommate request", `${await nameOf(admin, me)} wants to chat about sharing a room.`);
  return { threadId: row.id as string, status: "pending" as ThreadStatus };
}

export async function listThreads(me: string) {
  const admin = await getAdmin();
  const { data } = await admin
    .from("roommate_threads")
    .select("*")
    .or(`requester_id.eq.${me},recipient_id.eq.${me}`)
    .neq("status", "declined")
    .order("last_message_at", { ascending: false })
    .limit(100);
  const rows = (data ?? []) as Thread[];
  const items = [];
  for (const t of rows) {
    const other = t.requester_id === me ? t.recipient_id : t.requester_id;
    items.push({
      id: t.id,
      status: t.status,
      incoming: t.recipient_id === me && t.status === "pending",
      outgoing: t.requester_id === me && t.status === "pending",
      name: await nameOf(admin, other),
      last_message: t.last_message,
      last_message_at: t.last_message_at,
    });
  }
  return items;
}

export async function getThread(me: string, threadId: string) {
  const admin = await getAdmin();
  const t = await loadThread(admin, threadId, me);
  const { data: msgs } = await admin
    .from("roommate_messages")
    .select("id, sender_id, kind, body, created_at")
    .eq("thread_id", t.id)
    .order("created_at", { ascending: true })
    .limit(300);
  const other = t.requester_id === me ? t.recipient_id : t.requester_id;
  return {
    me,
    status: t.status,
    incoming: t.recipient_id === me && t.status === "pending",
    name: await nameOf(admin, other),
    messages: (msgs ?? []) as { id: string; sender_id: string; kind: "text" | "call"; body: string; created_at: string }[],
    callUrl: t.status === "active" ? videoRoomUrl(t.id) : null,
  };
}

export async function sendMessage(me: string, threadId: string, body: string) {
  const admin = await getAdmin();
  const t = await loadThread(admin, threadId, me);
  const chk = canSend(t.status);
  if (!chk.ok) throw new Error(chk.message);
  const text = cleanMessage(body);
  const { error } = await admin.from("roommate_messages").insert({ thread_id: t.id, sender_id: me, body: text });
  if (error) throw new Error("Couldn't send. Please try again.");
  await admin.from("roommate_threads").update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString() }).eq("id", t.id);
  const other = t.requester_id === me ? t.recipient_id : t.requester_id;
  await notify(admin, other, "New roommate message", `${await nameOf(admin, me)}: ${text.slice(0, 80)}`);
  return { ok: true };
}

export async function respond(me: string, threadId: string, decision: "accept" | "decline" | "block") {
  const admin = await getAdmin();
  const t = await loadThread(admin, threadId, me);
  if (decision === "block") {
    await admin.from("roommate_threads").update({ status: "blocked", blocked_by: me }).eq("id", t.id);
    return { status: "blocked" as ThreadStatus };
  }
  if (t.recipient_id !== me || t.status !== "pending") throw new Error("Nothing to respond to.");
  const status: ThreadStatus = decision === "accept" ? "active" : "declined";
  await admin.from("roommate_threads").update({ status }).eq("id", t.id);
  if (status === "active") await notify(admin, t.requester_id, "Roommate request accepted", `${await nameOf(admin, me)} accepted. You can chat now.`);
  return { status };
}

export async function startCall(me: string, threadId: string) {
  const admin = await getAdmin();
  const t = await loadThread(admin, threadId, me);
  const chk = canSend(t.status);
  if (!chk.ok) throw new Error(chk.message);
  await admin.from("roommate_messages").insert({ thread_id: t.id, sender_id: me, kind: "call", body: "Started a video call" });
  await admin.from("roommate_threads").update({ last_message: "📹 Video call", last_message_at: new Date().toISOString() }).eq("id", t.id);
  const other = t.requester_id === me ? t.recipient_id : t.requester_id;
  await notify(admin, other, "Video call invite", `${await nameOf(admin, me)} is calling you. Open Roommate chat to join.`);
  return { url: videoRoomUrl(t.id) };
}
