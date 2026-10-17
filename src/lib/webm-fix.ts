/**
 * Browser MediaRecorder writes WebM with NO duration (Chrome/Firefox stream it). Result: the player shows
 * "Infinity", the progress bar is dead, seeking restarts the download and loops stutter. We patch the
 * Segment/Info header with the real duration before upload. Pure byte-level, no dependencies.
 * Returns the original bytes untouched if the file isn't something we fully understand.
 */

const ID_SEGMENT = 0x18538067;
const ID_INFO = 0x1549a966;
const ID_DURATION = 0x4489;
const ID_TIMECODE_SCALE = 0x2ad7b1;
const ID_SEEKHEAD = 0x114d9b74;

type Vint = { value: number; length: number; unknown: boolean };

function readId(b: Uint8Array, p: number): Vint | null {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (len <= 4 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 4 || p + len > b.length) return null;
  let v = 0;
  for (let i = 0; i < len; i++) v = v * 256 + b[p + i];
  return { value: v, length: len, unknown: false };
}

function readSize(b: Uint8Array, p: number): Vint | null {
  const first = b[p];
  if (first === undefined || first === 0) return null;
  let len = 1;
  while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
  if (len > 8 || p + len > b.length) return null;
  let v = first & (0xff >> len);
  let allOnes = v === 0xff >> len;
  for (let i = 1; i < len; i++) {
    v = v * 256 + b[p + i];
    if (b[p + i] !== 0xff) allOnes = false;
  }
  return { value: v, length: len, unknown: allOnes };
}

function encodeSize(n: number): Uint8Array {
  // smallest vint that fits (n < 2^56)
  for (let len = 1; len <= 8; len++) {
    const max = Math.pow(2, 7 * len) - 2;
    if (n <= max) {
      const out = new Uint8Array(len);
      let v = n;
      for (let i = len - 1; i >= 0; i--) {
        out[i] = v % 256;
        v = Math.floor(v / 256);
      }
      out[0] |= 0x80 >> (len - 1);
      return out;
    }
  }
  throw new Error("size too large");
}

export function patchWebmDuration(original: Uint8Array, durationMs: number): Uint8Array {
  let work = original;
  const input = original;
  try {
    if (!(durationMs > 0) || input.length < 64) return input;
    // EBML header
    const hid = readId(input, 0);
    if (!hid || hid.value !== 0x1a45dfa3) return input;
    const hsz = readSize(input, hid.length);
    if (!hsz || hsz.unknown) return input;
    let p = hid.length + hsz.length + hsz.value;

    const sid = readId(input, p);
    if (!sid || sid.value !== ID_SEGMENT) return input;
    const ssz = readSize(input, p + sid.length);
    if (!ssz) return input;
    const segSizePos = p + sid.length;
    const segDataStart = segSizePos + ssz.length;

    // walk Segment children until Info
    let q = segDataStart;
    let infoPos = -1;
    let infoSize: Vint | null = null;
    let infoIdLen = 0;
    while (q < input.length) {
      const id = readId(input, q);
      if (!id) return input;
      const sz = readSize(input, q + id.length);
      if (!sz) return input;
      if (id.value === ID_SEEKHEAD && !sz.unknown) {
        // Its absolute offsets would be wrong once Info grows. Replace it by a same-size Void element
        // (players then just scan the file, which is exactly what they do for MediaRecorder output).
        const total = id.length + sz.length + sz.value;
        const sizeLen = total - 1 - 1 <= 126 ? 1 : 2;
        const voidData = total - 1 - sizeLen;
        if (voidData < 0 || voidData > 16382) return input;
        if (work === input) work = input.slice();
        work[q] = 0xec;
        if (sizeLen === 1) work[q + 1] = 0x80 | voidData;
        else {
          work[q + 1] = 0x40 | (voidData >> 8);
          work[q + 2] = voidData & 0xff;
        }
        work.fill(0, q + 1 + sizeLen, q + total);
      }
      if (id.value === ID_INFO) {
        infoPos = q;
        infoSize = sz;
        infoIdLen = id.length;
        break;
      }
      if (sz.unknown) return input;
      q += id.length + sz.length + sz.value;
    }
    if (infoPos < 0 || !infoSize || infoSize.unknown) return input;

    const infoDataStart = infoPos + infoIdLen + infoSize.length;
    const infoEnd = infoDataStart + infoSize.value;
    if (infoEnd > input.length) return input;

    // scan Info children for TimecodeScale / existing Duration
    let scale = 1_000_000;
    let r = infoDataStart;
    while (r < infoEnd) {
      const id = readId(input, r);
      if (!id) return input;
      const sz = readSize(input, r + id.length);
      if (!sz || sz.unknown) return input;
      const dataPos = r + id.length + sz.length;
      if (id.value === ID_DURATION) {
        const dv = new DataView(input.buffer, input.byteOffset + dataPos, sz.value);
        const existing = sz.value === 8 ? dv.getFloat64(0) : sz.value === 4 ? dv.getFloat32(0) : 0;
        if (existing > 0) return input; // already has a duration
      }
      if (id.value === ID_TIMECODE_SCALE) {
        let v = 0;
        for (let i = 0; i < sz.value; i++) v = v * 256 + input[dataPos + i];
        if (v > 0) scale = v;
      }
      r = dataPos + sz.value;
    }

    const dur = new Uint8Array(1 + 2 + 8); // id(2) + size(1) + float64
    dur[0] = 0x44;
    dur[1] = 0x89;
    dur[2] = 0x88;
    new DataView(dur.buffer).setFloat64(3, (durationMs * 1_000_000) / scale);

    const newInfoSizeBytes = encodeSize(infoSize.value + dur.length);
    const delta = dur.length + (newInfoSizeBytes.length - infoSize.length);

    const parts: Uint8Array[] = [
      work.subarray(0, infoPos + infoIdLen),
      newInfoSizeBytes,
      work.subarray(infoDataStart, infoEnd),
      dur,
      work.subarray(infoEnd),
    ];
    const out = new Uint8Array(work.length + delta);
    let o = 0;
    for (const part of parts) {
      out.set(part, o);
      o += part.length;
    }
    // known-size Segment: grow it by the bytes we added
    if (!ssz.unknown) {
      const newSeg = encodeSize(ssz.value + delta);
      if (newSeg.length !== ssz.length) return original; // would shift the layout again; skip
      out.set(newSeg, segSizePos);
    }
    return out;
  } catch {
    return original;
  }
}

/** Blob wrapper for the browser. */
export async function fixWebmBlobDuration(blob: Blob, durationMs: number): Promise<Blob> {
  if (!/webm/i.test(blob.type)) return blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const patched = patchWebmDuration(bytes, durationMs);
  return patched === bytes ? blob : new Blob([patched as BlobPart], { type: blob.type });
}
