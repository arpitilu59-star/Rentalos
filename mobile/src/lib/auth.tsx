import React, { createContext, useContext, useEffect, useState } from "react";
import { AppState, Platform } from "react-native";
import { focusManager, useQueryClient } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Ctx = { session: Session | null; loading: boolean };
const AuthCtx = createContext<Ctx>({ session: null, loading: true });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const queries = useQueryClient();
  useEffect(() => {
    let previousUser: string | undefined;
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, next) => {
      const user = next?.user.id;
      if (previousUser && previousUser !== user) queries.clear();
      previousUser = user;
      setSession(next);
      setLoading(false);
    });
    return () => subscription.unsubscribe();
  }, [queries]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    const updateFocus = (state: string) => focusManager.setFocused(state === "active");
    if (AppState.currentState) updateFocus(AppState.currentState);
    const listener = AppState.addEventListener("change", updateFocus);
    return () => listener.remove();
  }, []);
  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>;
}
