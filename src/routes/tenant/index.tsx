import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyTenants } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, HomeIcon, ArrowRight, Building2 } from "lucide-react";

export const Route = createFileRoute("/tenant/")({ component: TenantHome });

function TenantHome() {
  const nav = useNavigate();
  const [state, setState] = useState<"loading" | "signed-out" | "wrong-role" | "ok">("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { if (!cancelled) setState("signed-out"); return; }
      const { data: prof } = await supabase.from("profiles").select("primary_role").eq("id", session.user.id).maybeSingle();
      if (cancelled) return;
      if (prof?.primary_role === "landlord") { nav({ to: "/rentdesk" }); return; }
      if (prof?.primary_role == null) {
        try { await supabase.rpc("claim_primary_role", { _role: "tenant" }); } catch { /* ignore */ }
      }
      setState("ok");
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { if (!s) setState("signed-out"); });
    return () => { cancelled = true; sub.subscription.unsubscribe(); };
  }, [nav]);

  if (state === "loading") return <div className="min-h-screen grid place-items-center bg-background"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (state === "signed-out") return <SignedOut />;
  return <ChooseTenant />;
}

function SignedOut() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-card/60 backdrop-blur sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/tenant" className="flex items-center gap-2">
            <div className="size-8 rounded-xl bg-primary text-primary-foreground grid place-items-center font-bold">T</div>
            <div className="font-semibold tracking-tight">Tenant Portal</div>
          </Link>
          <Link to="/tenant/login" className="text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground">Sign in</Link>
        </div>
      </header>
      <section className="max-w-3xl mx-auto px-4 pt-16 pb-10 text-center">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Aapka <span className="text-primary">tenant dashboard</span></h1>
        <p className="mt-3 text-sm md:text-base text-muted-foreground">Rent bills, deposit, meter readings, maintenance tickets aur documents — sab ek jagah. Sign in karein with the email your landlord registered.</p>
        <Link to="/tenant/login" className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90">Sign in <ArrowRight className="size-4" /></Link>
      </section>
    </div>
  );
}

function ChooseTenant() {
  const fetchMine = useServerFn(getMyTenants);
  const { data, isLoading, error } = useQuery({ queryKey: ["my-tenants"], queryFn: () => fetchMine() });
  const nav = useNavigate();

  useEffect(() => {
    if (data?.tenants?.length === 1 && (data?.pendingBookings?.length ?? 0) === 0) {
      nav({ to: "/tenant/$tenantId", params: { tenantId: data.tenants[0].id } });
    }
  }, [data, nav]);

  const pendings = (data?.pendingBookings ?? []) as any[];
  const tenants = (data?.tenants ?? []) as any[];

  return (
    <TenantShell>
      <div className="max-w-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome</h1>
        <p className="text-sm text-muted-foreground mt-1">Aapki tenancies aur booking requests.</p>
        {isLoading ? (
          <div className="mt-10 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : error ? (
          <div className="mt-6 text-sm text-destructive">{(error as Error).message}</div>
        ) : (
          <div className="mt-6 space-y-4">
            {tenants.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Active tenancies</h2>
                <div className="space-y-2">
                  {tenants.map((t) => (
                    <Link key={t.id} to="/tenant/$tenantId" params={{ tenantId: t.id }} className="block rounded-2xl bg-card border border-border p-4 hover:bg-accent/50">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded-xl bg-primary/10 text-primary grid place-items-center"><Building2 className="size-5" /></div>
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{t.rooms?.properties?.name ?? "Property"} · Room {t.rooms?.room_number}</div>
                          <div className="text-xs text-muted-foreground truncate">{t.tenant_code ?? ""}</div>
                        </div>
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {pendings.length > 0 && (
              <section>
                <h2 className="text-sm font-medium text-muted-foreground mb-2">Booking requests</h2>
                <div className="space-y-2">
                  {pendings.map((b) => (
                    <div key={b.id} className="rounded-2xl bg-card border border-border p-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="font-medium">{b.rooms?.properties?.name} · Room {b.rooms?.room_number}</div>
                          <div className="text-xs text-muted-foreground">₹{b.rooms?.rent_amount}/mo · {b.rooms?.properties?.myr_city || b.rooms?.properties?.city}</div>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${b.status === "rejected" ? "bg-destructive/15 text-destructive" : "bg-accent text-accent-foreground"}`}>
                          {b.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tenants.length === 0 && pendings.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-6 text-sm text-muted-foreground">
                No tenancy or bookings yet. <Link to="/myr/browse" className="text-primary underline">Browse rooms</Link> to book one.
              </div>
            )}
          </div>
        )}
      </div>
    </TenantShell>
  );
}
