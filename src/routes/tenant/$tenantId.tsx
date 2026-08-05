import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId")({ component: Layout });

function Layout() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId" });
  const nav = useNavigate();
  const [ok, setOk] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) nav({ to: "/tenant/login" });
      else setOk(true);
    });
  }, [nav, tenantId]);
  if (!ok) return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  return <Outlet />;
}
