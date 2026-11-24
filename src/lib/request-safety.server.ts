import { createHmac } from "node:crypto";

export function privateHash(scope: string, value: string) {
  const secret = process.env.REQUEST_HASH_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error("Request verification unavailable");
  return createHmac("sha256", secret).update(`${scope}:${value}`).digest("hex");
}
export function requestIp(request: Request) {
  // Vercel overwrites this header. Outside Vercel use a shared conservative bucket;
  // do not trust arbitrary client-supplied X-Forwarded-For values.
  return process.env.VERCEL
    ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || "unknown"
    : "local";
}
export async function readSmallJson(request: Request, limit = 16000): Promise<unknown> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new Error("Use JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Request too large.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export function sameSiteRequest(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}
