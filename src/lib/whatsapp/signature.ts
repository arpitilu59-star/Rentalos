/**
 * Verify Meta's X-Hub-Signature-256 header (HMAC-SHA256 of the RAW body,
 * keyed with the App Secret). Uses Web Crypto so it runs on Workers/Node.
 * Constant-time compare.
 */
export async function verifyMetaSignature(
  rawBody: string,
  header: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!header || !header.startsWith("sha256=")) return false;
  const expectedHex = header.slice(7).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(expectedHex)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody)),
  );
  const actual = Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ expectedHex.charCodeAt(i);
  return diff === 0;
}
