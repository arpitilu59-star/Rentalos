import { STRINGS } from "./strings";

export type Lang = "hinglish" | "en" | "hi";

/** Pure lookup (unit-tested). Hinglish = text as written in the screens. */
export function translate(src: string, lang: Lang, vars?: Record<string, string | number>): string {
  let out = src;
  if (lang !== "hinglish") {
    const hit = STRINGS[src];
    if (hit) out = lang === "en" ? (hit[0] ?? src) : hit[1];
  }
  if (vars) out = out.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`));
  return out;
}

/** Translates a string that may have leading/trailing spaces (e.g. a fragment of a sentence). */
export function translateLoose(src: string, lang: Lang): string {
  if (lang === "hinglish") return src;
  const direct = STRINGS[src];
  if (direct) return translate(src, lang);
  const m = /^(\s*)(.*?)(\s*)$/s.exec(src);
  if (!m || !m[2]) return src;
  return m[1] + translate(m[2], lang) + m[3];
}

