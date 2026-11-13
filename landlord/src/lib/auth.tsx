import React, { createContext, useContext, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

type Ctx = { session: Session | null; loading: boolean };
const AuthCtx = createContext<Ctx>({ session: null, loading: true });
export const useAuth = () => useContext(AuthCtx);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  return <AuthCtx.Provider value={{ session, loading }}>{children}</AuthCtx.Provider>;
}

// A message that must survive the redirect to the login screen (the login screen is re-created after sign-out).
let notice: string | null = null;
export const setAuthNotice = (m: string) => {
  notice = m;
};
export const takeAuthNotice = () => {
  const m = notice;
  notice = null;
  return m;
};

// True while sign-up is still creating the landlord role on the server. The tabs screen mounts the instant
// a session exists and asks "am I a landlord?" — without this guard it asks too early and signs the new user out.
let claiming = false;
export const setClaiming = (v: boolean) => {
  claiming = v;
};
export const isClaiming = () => claiming;
