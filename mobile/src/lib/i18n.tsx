import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { translate, type Lang } from "./translate";
export type { Lang } from "./translate";
export { translate, translateLoose } from "./translate";

export const LANGS: Array<[Lang, string]> = [["hinglish", "Hinglish"], ["en", "English"], ["hi", "हिन्दी"]];
const KEY = "rentalos_lang";

type Ctx = { lang: Lang; setLang: (l: Lang) => void };
const LangCtx = createContext<Ctx>({ lang: "hinglish", setLang: () => undefined });

export function LangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>("hinglish");
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((v) => { if (v === "en" || v === "hi" || v === "hinglish") setLangState(v); }).catch(() => undefined);
  }, []);
  const setLang = useCallback((l: Lang) => { setLangState(l); AsyncStorage.setItem(KEY, l).catch(() => undefined); }, []);
  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);
  return <LangCtx.Provider value={value}>{children}</LangCtx.Provider>;
}

export const useLang = () => useContext(LangCtx);

/** t("Some text") or t("Baaki {amt}", { amt }) in the chosen language. */
export function useT() {
  const { lang } = useLang();
  return useCallback((src: string, vars?: Record<string, string | number>) => translate(src, lang, vars), [lang]);
}
