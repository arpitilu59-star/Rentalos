import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/myr/landlord")({ component: LandlordLayout });

function LandlordLayout() {
  const nav = useNavigate();
  const [state, setState] = useState<"loading" | "ready">("loading");

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { nav({ to: "/login" }); return; }
      const { data } = await supabase.from("myr_user_roles").select("role").eq("user_id", session.user.id).eq("role", "landlord").maybeSingle();
      if (!data) { nav({ to: "/myr/onboard", search: { role: "landlord" } as never }); return; }
      setState("ready");
    })();
  }, [nav]);

  if (state === "loading") return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  return <Outlet />;
}
