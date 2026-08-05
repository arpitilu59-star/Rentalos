import { createFileRoute, Outlet, useNavigate, useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({ component: AuthLayout });

function AuthLayout() {
  const nav = useNavigate();
  const { pathname } = useLocation();
  const [state, setState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { nav({ to: "/landlord/login" }); return; }

      const [{ data: profile }, { data: props }] = await Promise.all([
        supabase.from("profiles").select("full_name, phone, primary_role").eq("id", session.user.id).maybeSingle(),
        supabase.from("properties").select("id").limit(1),
      ]);

      if (cancelled) return;

      // Role guard — this subtree is landlord-only
      const role = profile?.primary_role ?? null;
      if (role === "tenant") { nav({ to: "/tenant" }); return; }
      if (role === null) {
        // Claim landlord role for legacy user
        try { await supabase.rpc("claim_primary_role", { _role: "landlord" }); } catch { /* ignore */ }
      }

      const onboarded = !!profile?.full_name && !!profile?.phone && (props?.length ?? 0) > 0;
      if (!onboarded && pathname !== "/onboarding") {
        nav({ to: "/onboarding" });
      }
      setState("ready");
    };

    check();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) nav({ to: "/landlord/login" });
    });
    return () => { cancelled = true; subscription.unsubscribe(); };
  }, [nav, pathname]);

  if (state === "loading") {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return <Outlet />;
}
