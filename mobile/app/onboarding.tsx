import React, { useRef, useState } from "react";
import { Dimensions, FlatList, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Button } from "@/components/ui";
import { useColors } from "@/theme";

export const ONBOARD_KEY = "rentalos_onboarded";
const W = Dimensions.get("window").width;
const SLIDES = [
  { icon: "home", t: "Verified rooms, seedhe owner se", s: "Live photos aur video ke saath. Koi brokerage nahi." },
  { icon: "document-text", t: "Terms padho, phir book karo", s: "Rent, deposit aur rules pehle se saaf. Booking, rent aur complaint sab app me." },
  { icon: "people", t: "Roommate bhi yahin milega", s: "Apni aadaton se match karo. Chat aur video call, number share kiye bina." },
] as const;

export default function Onboarding() {
  const c = useColors();
  const router = useRouter();
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const finish = async () => { await AsyncStorage.setItem(ONBOARD_KEY, "1"); router.replace("/login"); };
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <FlatList ref={list} data={SLIDES} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(s) => s.t}
        onMomentumScrollEnd={(e) => setI(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={{ width: W, alignItems: "center", justifyContent: "center", padding: 32, gap: 16 }}>
            <View style={{ width: 120, height: 120, borderRadius: 60, backgroundColor: c.soft, alignItems: "center", justifyContent: "center" }}><Ionicons name={item.icon} size={56} color={c.primary} /></View>
            <Text style={{ color: c.text, fontSize: 24, fontWeight: "800", textAlign: "center" }}>{item.t}</Text>
            <Text style={{ color: c.muted, fontSize: 15, textAlign: "center", lineHeight: 22 }}>{item.s}</Text>
          </View>
        )} />
      <View style={{ flexDirection: "row", justifyContent: "center", gap: 8, marginBottom: 16 }}>
        {SLIDES.map((_, k) => <View key={k} style={{ width: k === i ? 22 : 8, height: 8, borderRadius: 4, backgroundColor: k === i ? c.primary : c.border }} />)}
      </View>
      <View style={{ padding: 20, paddingBottom: 36, gap: 8 }}>
        <Button title={i === SLIDES.length - 1 ? "Shuru karein" : "Aage"} onPress={() => (i === SLIDES.length - 1 ? finish() : list.current?.scrollToIndex({ index: i + 1 }))} />
        {i < SLIDES.length - 1 && <Button kind="ghost" title="Skip" onPress={finish} />}
      </View>
    </View>
  );
}
