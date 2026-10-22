import React from "react";
import { Alert, Pressable, View } from "react-native";
import { useNavigation } from "expo-router";
import { Text, TextInput } from "@/components/Text";
import { useColors, R } from "@/theme";

/** Labelled text field. */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard,
  multiline,
  required,
  hint,
  maxLength,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  keyboard?: "default" | "numeric" | "phone-pad" | "email-address";
  multiline?: boolean;
  required?: boolean;
  hint?: string;
  maxLength?: number;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 5 }}>
      <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
        {label}
        {required ? <Text style={{ color: c.danger }}> *</Text> : null}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={c.muted}
        keyboardType={keyboard}
        multiline={multiline}
        maxLength={maxLength}
        style={{
          backgroundColor: c.card,
          borderColor: c.border,
          borderWidth: 1,
          borderRadius: R.m,
          padding: 12,
          color: c.text,
          fontSize: 15,
          minHeight: multiline ? 84 : undefined,
          textAlignVertical: multiline ? "top" : "center",
        }}
      />
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

/** Single-choice chips. Tapping the active chip does nothing unless `clearable`. */
export function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  required,
  hint,
}: {
  label: string;
  value: T | null | undefined;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  required?: boolean;
  hint?: string;
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.text, fontWeight: "600", fontSize: 13 }}>
        {label}
        {required ? <Text style={{ color: c.danger }}> *</Text> : null}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map(([k, l]) => (
          <Pressable
            key={k}
            onPress={() => onChange(k)}
            style={{
              paddingVertical: 8,
              paddingHorizontal: 13,
              borderRadius: 99,
              borderWidth: 1,
              backgroundColor: value === k ? c.primary : c.card,
              borderColor: value === k ? c.primary : c.border,
            }}
          >
            <Text
              style={{ color: value === k ? c.onPrimary : c.text, fontSize: 13, fontWeight: "600" }}
            >
              {l}
            </Text>
          </Pressable>
        ))}
      </View>
      {hint ? <Text style={{ color: c.muted, fontSize: 12 }}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({
  text,
  tone = "muted",
}: {
  text: string;
  tone?: "ok" | "warn" | "danger" | "muted" | "primary";
}) {
  const c = useColors();
  const col =
    tone === "ok"
      ? c.ok
      : tone === "warn"
        ? c.warn
        : tone === "danger"
          ? c.danger
          : tone === "primary"
            ? c.primary
            : c.muted;
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: col,
        borderRadius: 99,
        paddingHorizontal: 9,
        paddingVertical: 2,
        alignSelf: "flex-start",
      }}
    >
      <Text style={{ color: col, fontSize: 11, fontWeight: "700" }}>{text}</Text>
    </View>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  const c = useColors();
  return (
    <View
      style={{
        flexDirection: "row",
        backgroundColor: c.soft,
        borderRadius: R.m,
        padding: 4,
        margin: 16,
        marginBottom: 4,
      }}
    >
      {options.map(([k, l]) => (
        <Pressable
          key={k}
          onPress={() => onChange(k)}
          style={{
            flex: 1,
            paddingVertical: 9,
            borderRadius: R.m - 4,
            alignItems: "center",
            backgroundColor: value === k ? c.card : "transparent",
          }}
        >
          <Text
            style={{ color: value === k ? c.primary : c.muted, fontWeight: "700", fontSize: 13 }}
          >
            {l}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

export function Row({ k, v }: { k: string; v: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 10, paddingVertical: 2 }}>
      <Text style={{ color: c.muted, width: 110, fontSize: 13 }}>{k}</Text>
      <Text style={{ color: c.text, flex: 1, fontWeight: "600", fontSize: 13 }}>{v}</Text>
    </View>
  );
}

export function SearchBar({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const c = useColors();
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={c.muted}
      accessibilityLabel={placeholder}
      clearButtonMode="while-editing"
      style={{
        backgroundColor: c.card,
        borderColor: c.border,
        borderWidth: 1,
        borderRadius: R.m,
        padding: 11,
        color: c.text,
        fontSize: 14,
      }}
    />
  );
}

export function FilterRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<[T, string]>;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {options.map(([k, l]) => (
        <Pressable
          key={k}
          onPress={() => onChange(k)}
          style={{
            paddingVertical: 6,
            paddingHorizontal: 12,
            borderRadius: 99,
            borderWidth: 1,
            backgroundColor: value === k ? c.primary : c.card,
            borderColor: value === k ? c.primary : c.border,
          }}
        >
          <Text
            style={{ color: value === k ? c.onPrimary : c.text, fontSize: 12, fontWeight: "700" }}
          >
            {l}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

/** Asks before leaving a form with unsaved edits. Wrap user-edit setters with `wrap`; call `clear()` right before navigating after a save. */
export function useUnsavedGuard() {
  const nav = useNavigation();
  const dirty = React.useRef(false);
  React.useEffect(
    () =>
      nav.addListener("beforeRemove", (e) => {
        if (!dirty.current) return;
        e.preventDefault();
        Alert.alert("Badlav save nahi hue", "Bina save kiye wapas jaana hai?", [
          { text: "Ruko", style: "cancel" },
          { text: "Chhodein", style: "destructive", onPress: () => nav.dispatch(e.data.action) },
        ]);
      }),
    [nav],
  );
  return {
    wrap:
      <A,>(fn: (a: A) => void) =>
      (a: A) => {
        dirty.current = true;
        fn(a);
      },
    mark: () => {
      dirty.current = true;
    },
    clear: () => {
      dirty.current = false;
    },
  };
}
