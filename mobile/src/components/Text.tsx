import React from "react";
import { Text as RNText, TextInput as RNTextInput, type TextProps, type TextInputProps } from "react-native";
import { translateLoose, useLang, type Lang } from "@/lib/i18n";

const tr = (children: React.ReactNode, lang: Lang): React.ReactNode => {
  if (typeof children === "string") return translateLoose(children, lang);
  if (Array.isArray(children)) return children.map((c) => (typeof c === "string" ? translateLoose(c, lang) : c));
  return children;
};

/** Drop-in <Text> that shows the user's chosen language (looks the text up in strings.ts). */
export function Text({ children, ...rest }: TextProps) {
  const { lang } = useLang();
  return <RNText {...rest}>{tr(children, lang)}</RNText>;
}

export const TextInput = React.forwardRef<RNTextInput, TextInputProps>(function TextInput({ placeholder, ...rest }, ref) {
  const { lang } = useLang();
  return <RNTextInput ref={ref} placeholder={placeholder ? translateLoose(placeholder, lang) : placeholder} {...rest} />;
});
