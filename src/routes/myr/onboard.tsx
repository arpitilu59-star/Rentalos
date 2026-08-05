import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { ensureMyrRole } from "@/lib/myr.functions";
import { Building2, Search, Loader2 } from "lucide-react";

type S = { role?: "tenant" | "landlord" };

export const Route = createFileRoute("/myr/onboard")({
  component: OnboardPage,
  validateSearch: (s: Record<string, unknown>): S => ({
    role: s.role === "tenant" || s.role === "landlord" ? s.role : undefined,
  }),
});

function OnboardPage() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const ensure = useServerFn(ensureMyrRole);
  const [busy, setBusy] = useState<string | null>(null);
  const [needLogin, setNeedLogin] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setNeedLogin(!data.session));
  }, []);

  const pick = async (role: "tenant" | "landlord") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { nav({ to: "/login" }); return; }
    setBusy(role);
    try {
      await ensure({ data: { role } });
      nav({ to: role === "landlord" ? "/myr/landlord" : "/myr/browse" });
    } finally { setBusy(null); }
  };

  return (
    <div className="min-h-screen grid place-items-center bg-background p-4">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-6">
          <div className="size-12 mx-auto rounded-2xl bg-primary text-primary-foreground grid place-items-center font-bold text-xl">M</div>
          <h1 className="mt-3 text-2xl md:text-3xl font-semibold tracking-tight">Welcome to ManageYourRoom</h1>
          <p className="text-sm text-muted-foreground mt-1">Aap kya karna chahte hain?</p>
        </div>
        {needLogin && (
          <div className="mb-4 text-center text-xs text-muted-foreground">
            Continue karne ke liye <button onClick={() => nav({ to: "/login" })} className="text-primary underline">sign in</button> karein.
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-3">
          <button onClick={() => pick("tenant")} disabled={!!busy} className={`text-left rounded-2xl bg-card border-2 p-5 hover:border-primary transition ${search.role === "tenant" ? "border-primary" : "border-border"}`}>
            <Search className="size-6 text-primary" />
            <div className="mt-3 font-semibold">I'm a Tenant</div>
            <div className="text-xs text-muted-foreground mt-1">PG, room, flat dhundhein. Verified owners se direct contact.</div>
            <div className="mt-3 text-xs font-medium inline-flex items-center gap-1 text-primary">
              {busy === "tenant" ? <Loader2 className="size-3 animate-spin" /> : null} Continue as tenant →
            </div>
          </button>
          <button onClick={() => pick("landlord")} disabled={!!busy} className={`text-left rounded-2xl bg-card border-2 p-5 hover:border-primary transition ${search.role === "landlord" ? "border-primary" : "border-border"}`}>
            <Building2 className="size-6 text-primary" />
            <div className="mt-3 font-semibold">I'm a Landlord</div>
            <div className="text-xs text-muted-foreground mt-1">Apni property list karein. Verified tenants se inquiries paayein.</div>
            <div className="mt-3 text-xs font-medium inline-flex items-center gap-1 text-primary">
              {busy === "landlord" ? <Loader2 className="size-3 animate-spin" /> : null} Continue as landlord →
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
