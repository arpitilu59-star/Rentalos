/**
 * Browser-side SHA-256 file hashing via the native Web Crypto API —
 * no library, no cost. Used for duplicate-photo fraud detection: call
 * this right after a room photo finishes uploading, then send the hash
 * to recordPhotoFingerprint() in trust.functions.ts.
 */
export async function hashFile(file: File): Promise<string> {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
