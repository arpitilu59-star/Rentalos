/** Deterministic intent detection — no LLM, no guessing. */
export type Intent =
  | "GET_RENT_DUE_DATE"
  | "GET_CURRENT_RENT"
  | "GET_PAYMENT_STATUS"
  | "GET_MAINTENANCE_STATUS"
  | "OPEN_DASHBOARD"
  | "HELP"
  | "UNKNOWN";

const PATTERNS: [Intent, RegExp][] = [
  ["HELP", /^(help|menu|hi|hello|hey|start|options|\?)$/i],
  ["GET_RENT_DUE_DATE", /(rent|bill).*(due|date|when)|when.*(rent|bill)|due date/i],
  [
    "GET_PAYMENT_STATUS",
    /(payment|paid|receipt).*(status|done|received|verified)|status.*(payment|paid)|did.*pay|payment status/i,
  ],
  [
    "GET_MAINTENANCE_STATUS",
    /(maintenance|repair|complaint|ticket|issue).*(status|update)|status.*(maintenance|repair|complaint|ticket)|maintenance/i,
  ],
  [
    "GET_CURRENT_RENT",
    /(how much|what).*(rent|bill|pay)|^(my|current)\s+(rent|bill)|rent amount|^rent$/i,
  ],
  ["OPEN_DASHBOARD", /(dashboard|open|link|website|app|login)/i],
];

export function detectIntent(text: string): Intent {
  const t = (text ?? "").trim().slice(0, 300);
  if (!t) return "UNKNOWN";
  for (const [intent, re] of PATTERNS) if (re.test(t)) return intent;
  return "UNKNOWN";
}
