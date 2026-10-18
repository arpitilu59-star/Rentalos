import React from "react";
import { View } from "react-native";
import { Chip } from "@/components/ui";
import { LANGS, useLang } from "@/lib/i18n";

export function LangPicker() {
  const { lang, setLang } = useLang();
  return <View style={{ flexDirection: "row", flexWrap: "wrap", rowGap: 6 }}>{LANGS.map(([k, l]) => <Chip key={k} label={l} active={lang === k} onPress={() => setLang(k)} />)}</View>;
}
