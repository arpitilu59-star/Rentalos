import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { AccountSettings } from "@/components/AccountSettings";
import { Loader2, UserCircle } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/profile")({ component: Page });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/profile" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });
  const t = data?.tenant;

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><UserCircle className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">My Profile</h1></div>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !t ? null : (
        <div className="rounded-2xl bg-card border border-border p-5 max-w-xl space-y-2 text-sm">
          <Row label="Name" value={t.name} />
          <Row label="Phone" value={t.phone} />
          <Row label="Email" value={t.email ?? "—"} />
          <Row label="Move-in" value={new Date(t.move_in_date).toLocaleDateString("en-IN")} />
          <Row label="Persons" value={t.persons} />
          <div className="mt-3 text-xs text-muted-foreground">Tenancy details change karne ke liye landlord se request karein.</div>
        </div>
      )}
      <div className="max-w-xl">
        <AccountSettings onSignedOutTo="/tenant/login" />
      </div>
    </TenantShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-3 border-b border-border last:border-0 pb-2 last:pb-0"><span className="text-muted-foreground">{label}</span><span className="font-medium">{value}</span></div>;
}
