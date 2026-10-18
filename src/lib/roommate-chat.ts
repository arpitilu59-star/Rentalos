/** Pure rules for roommate chat — kept separate so they are unit-testable. */
export type ThreadStatus = "pending" | "active" | "declined" | "blocked";

export type SendCheck = { ok: true } | { ok: false; message: string };

export function canSend(status: ThreadStatus): SendCheck {
  if (status === "active") return { ok: true };
  if (status === "pending") return { ok: false, message: "Wait for them to accept your request first." };
  if (status === "declined") return { ok: false, message: "This request was declined." };
  return { ok: false, message: "This conversation is blocked." };
}

export const cleanMessage = (s: string): string => s.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, 2000);

/** Phone numbers / emails are for the in-app flow only; strip them from first messages so contact stays inside Rentalos. */
export function maskContactDetails(s: string): string {
  return s
    .replace(/\+?\d(?:[\s-]?\d){8,}/g, "[number hidden]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email hidden]");
}

/** Unguessable video room: the thread id is a random UUID known only to its two members. */
export const videoRoomName = (threadId: string): string => `rentalos-rm-${threadId.replace(/-/g, "")}`;
/** Open Jitsi server that lets the first person start a room WITHOUT signing in (meet.jit.si now demands a login). */
export const DEFAULT_VIDEO_DOMAIN = "meet.ffmuc.net";
const VIDEO_HASH = "#config.prejoinPageEnabled=false&config.prejoinConfig.enabled=false&config.disableDeepLinking=true&config.requireDisplayName=false";
export const videoRoomUrl = (threadId: string, domain: string = DEFAULT_VIDEO_DOMAIN): string =>
  `https://${domain}/${videoRoomName(threadId)}${VIDEO_HASH}`;
