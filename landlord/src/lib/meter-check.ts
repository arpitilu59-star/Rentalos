/**
 * Meter-reading safety rules, shared by the RentDesk app (instant feedback) and the server (authoritative).
 * Keep landlord/src/lib/meter-check.ts byte-identical (a test enforces it).
 *
 * Decimal convention: most Indian meters show 5 black digits + 1 red digit. The red digit is a tenth of a unit,
 * so the number "12345" followed by a red "6" is written 12345.6 — always with a dot, never a comma.
 */
export type MeterCheckInput = {
  raw: string;
  prev: number | null;
  date: string;
  today: string;
  existingDates: string[];
  typicalDelta: number | null;
  reason?: string;
  confirmHigh?: boolean;
};
export type MeterCheck = {
  value: number | null;
  errors: string[];
  warnings: string[];
  /** The input needs a written reason (reading is lower than the last approved one). */
  needsReason: boolean;
  /** The input is far above normal usage and must be explicitly confirmed. */
  needsConfirmHigh: boolean;
  delta: number | null;
  ok: boolean;
};

export const MAX_READING = 9_999_999.99;

export function checkMeterReading(i: MeterCheckInput): MeterCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const base = {
    value: null,
    errors,
    warnings,
    needsReason: false,
    needsConfirmHigh: false,
    delta: null,
    ok: false,
  } as MeterCheck;
  const raw = i.raw.trim();
  if (raw === "") return base;

  if (/[,\s]/.test(raw)) {
    errors.push(
      "Comma ya space mat lagayein. Decimal ke liye sirf '.' use karein (jaise 12345.6).",
    );
    return base;
  }
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    errors.push(
      "Reading sirf number honi chahiye (negative ya letters nahi). Jaise 12345 ya 12345.6",
    );
    return base;
  }
  const decimals = raw.includes(".") ? raw.split(".")[1].length : 0;
  if (decimals > 2) {
    errors.push("Decimal ke baad maximum 2 digit. Meter ka laal (red) digit 1 decimal hota hai.");
    return base;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value > MAX_READING) {
    errors.push("Ye reading bahut badi hai. Meter par dobara dekhein.");
    return base;
  }
  base.value = value;
  if (decimals === 2)
    warnings.push(
      "Zyada tar meter mein sirf 1 decimal (laal digit) hota hai. Meter dobara check kar lein.",
    );

  if (i.date > i.today) errors.push("Date future ki hai. Aaj ya pehle ki date chunein.");
  if (i.existingDates.includes(i.date))
    errors.push("Is room ki is date par reading pehle se hai. Doosri date chunein.");

  if (i.prev !== null) {
    const delta = Math.round((value - i.prev) * 100) / 100;
    base.delta = delta;
    if (delta < 0) {
      base.needsReason = true;
      warnings.push(
        `Ye reading pichli approved reading (${i.prev}) se KAM hai. Meter badla ya reset hua ho tabhi save karein.`,
      );
      if ((i.reason ?? "").trim().length < 10)
        errors.push(
          "Kam reading ke liye wajah likhein (kam se kam 10 akshar), jaise 'Meter badla gaya'.",
        );
    } else if (delta === 0) {
      warnings.push("Pichli reading jaisi hi hai — koi bijli use nahi dikh raha.");
    } else if (
      i.typicalDelta !== null &&
      i.typicalDelta > 0 &&
      delta > Math.max(i.typicalDelta * 4, 300)
    ) {
      base.needsConfirmHigh = true;
      warnings.push(
        `Pichli reading se ${delta} unit zyada hain, jabki pichli baar ${i.typicalDelta} the. Number aur room dobara check karein.`,
      );
      if (!i.confirmHigh)
        errors.push("Itni badi badhat ko 'Haan, sahi hai' se confirm karna hoga.");
    }
  }
  base.ok = errors.length === 0;
  return base;
}
