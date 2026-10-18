/**
 * Video call link for a roommate chat.
 * - If JaaS (8x8 Jitsi as a Service) keys are set, both people join as moderators with a signed token (most reliable).
 * - Otherwise a public Jitsi server that needs no login (VIDEO_DOMAIN, default meet.ffmuc.net).
 */
import { createSign } from "node:crypto";
import { videoRoomName, videoRoomUrl, DEFAULT_VIDEO_DOMAIN } from "./roommate-chat";

const b64 = (v: object | Buffer) => (Buffer.isBuffer(v) ? v : Buffer.from(JSON.stringify(v))).toString("base64url");

export function jaasToken(opts: { appId: string; keyId: string; privateKey: string; room: string; userId: string; name: string; now?: number }): string {
  const now = Math.floor((opts.now ?? Date.now()) / 1000);
  const kid = opts.keyId.includes("/") ? opts.keyId : `${opts.appId}/${opts.keyId}`;
  const head = b64({ alg: "RS256", typ: "JWT", kid });
  const body = b64({
    aud: "jitsi", iss: "chat", sub: opts.appId, room: opts.room, nbf: now - 10, exp: now + 3 * 3600,
    context: { user: { id: opts.userId, name: opts.name, moderator: "true" }, features: { recording: "false", livestreaming: "false" } },
  });
  const sig = createSign("RSA-SHA256").update(`${head}.${body}`).sign(opts.privateKey);
  return `${head}.${body}.${b64(sig)}`;
}

export function callUrlFor(threadId: string, userId: string, name: string): string {
  const appId = process.env.JAAS_APP_ID;
  const keyId = process.env.JAAS_KEY_ID;
  const pem = process.env.JAAS_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (appId && keyId && pem) {
    try {
      const room = videoRoomName(threadId);
      const jwt = jaasToken({ appId, keyId, privateKey: pem, room, userId, name });
      return `https://8x8.vc/${appId}/${room}?jwt=${jwt}#config.prejoinConfig.enabled=false&config.disableDeepLinking=true`;
    } catch (e) {
      console.error("[video] JaaS token failed, using public server:", e instanceof Error ? e.message : e);
    }
  }
  return videoRoomUrl(threadId, process.env.VIDEO_DOMAIN || DEFAULT_VIDEO_DOMAIN);
}
