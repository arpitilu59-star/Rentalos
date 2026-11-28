import React, { createContext, useContext, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const key = "rentalos_onboarded";
const OnboardingContext = createContext<{ done: boolean | null; finish: () => void } | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(key).then(
      (value) => {
        if (active) setDone(value === "1");
      },
      () => {
        if (active) setDone(true);
      },
    );
    return () => {
      active = false;
    };
  }, []);
  function finish() {
    setDone(true);
    void AsyncStorage.setItem(key, "1").catch(() => {});
  }
  return (
    <OnboardingContext.Provider value={{ done, finish }}>{children}</OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const state = useContext(OnboardingContext);
  if (!state) throw new Error("Missing OnboardingProvider");
  return state;
}
