import React, { useEffect, useState } from "react";
import { ScrollView } from "react-native";
import * as Location from "expo-location";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Button, ErrorText } from "@/components/ui";
import { Field, useUnsavedGuard } from "@/lib/ui2";
import { Text } from "@/components/Text";
import { useColors } from "@/theme";

type P = {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
};

export default function PropertyForm() {
  const c = useColors();
  const router = useRouter();
  const qc = useQueryClient();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const guard = useUnsavedGuard();
  const props = useQuery({
    queryKey: ["props"],
    queryFn: () => api<{ properties: P[] }>("l/properties"),
  });
  const initial = props.data?.properties.find((p) => p.id === id);
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [geo, setGeo] = useState<{ lat: number; lng: number } | null>(null);
  const [locErr, setLocErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  useEffect(() => {
    if (initial) {
      setName(initial.name);
      setCity(initial.city ?? "");
      setAddress(initial.address ?? "");
      if (initial.latitude != null && initial.longitude != null)
        setGeo({ lat: initial.latitude, lng: initial.longitude });
    }
  }, [initial?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const here = async () => {
    setLocErr(null);
    setLocating(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted")
        throw new Error(
          "Location permission chahiye. Property par jaakar 'Use current location' dabayein.",
        );
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      guard.mark();
      setGeo({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      const [r] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      if (r) {
        if (!city) setCity(r.city ?? r.subregion ?? "");
        if (!address)
          setAddress(
            [r.name, r.street, r.district, r.city ?? r.subregion, r.postalCode]
              .filter(Boolean)
              .join(", "),
          );
      }
    } catch (e) {
      setLocErr(e instanceof Error ? e.message : "Location nahi mili.");
    } finally {
      setLocating(false);
    }
  };
  const save = useMutation({
    mutationFn: () =>
      api("l/property/save", {
        id,
        name,
        city,
        address,
        latitude: geo?.lat ?? null,
        longitude: geo?.lng ?? null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["props"] });
      qc.invalidateQueries({ queryKey: ["home"] });
      guard.clear();
      router.back();
    },
  });
  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 14 }}
      keyboardShouldPersistTaps="handled"
    >
      <Field
        label="Property ka naam"
        value={name}
        onChange={guard.wrap(setName)}
        required
        placeholder="Sharma PG"
      />
      <Button
        kind="ghost"
        title={
          locating
            ? "Location dhoondh raha hai…"
            : geo
              ? "📍 Location mil gayi — dobara lein"
              : "📍 Use current location (property par khade hokar)"
        }
        onPress={here}
        busy={locating}
      />
      {geo ? (
        <Text style={{ color: c.ok, fontSize: 12 }}>
          Map location save hogi ({geo.lat.toFixed(4)}, {geo.lng.toFixed(4)}). Isi se tenants 'near
          me' mein aapko dekhte hain.
        </Text>
      ) : (
        <Text style={{ color: c.muted, fontSize: 12 }}>
          Room list karne ke liye map location zaroori hai.
        </Text>
      )}
      {locErr ? <Text style={{ color: c.danger, fontSize: 13 }}>{locErr}</Text> : null}
      <Field
        label="City"
        value={city}
        onChange={guard.wrap(setCity)}
        required
        placeholder="Jaipur"
      />
      <Field
        label="Poora address"
        value={address}
        onChange={guard.wrap(setAddress)}
        required
        multiline
      />
      <ErrorText error={save.error} />
      <Button
        title="Save karein"
        busy={save.isPending}
        disabled={name.trim().length < 2}
        onPress={() => save.mutate()}
      />
    </ScrollView>
  );
}
