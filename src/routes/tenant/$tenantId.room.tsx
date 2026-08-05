import { createFileRoute, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getTenantDashboard } from "@/lib/tenant.functions";
import { TenantShell } from "@/components/TenantShell";
import { Loader2, Home as HomeIcon, MapPin, IndianRupee, Users } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/room")({ component: Page });

const inr = (n: number) => "₹" + (n || 0).toLocaleString("en-IN", { maximumFractionDigits: 0 });

function Page() {
  const { tenantId } = useParams({ from: "/tenant/$tenantId/room" });
  const fetch = useServerFn(getTenantDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["tenant-dash", tenantId], queryFn: () => fetch({ data: { tenant_id: tenantId } }) });

  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><HomeIcon className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">My Room</h1></div>
      {isLoading ? <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      : !data?.room ? <div className="py-20 text-center text-sm text-muted-foreground">No room linked.</div>
      : (
        <div className="space-y-4 max-w-xl">
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="text-xs uppercase text-muted-foreground">Property</div>
            <div className="text-xl font-semibold">{data.room.properties?.name}</div>
            {data.room.properties?.address && <div className="mt-1 text-xs text-muted-foreground flex items-center gap-1"><MapPin className="size-3" /> {data.room.properties.address}</div>}
            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
              <Box icon={HomeIcon} label="Room" value={data.room.room_number} />
              <Box icon={IndianRupee} label="Rent" value={inr(data.room.rent_amount)} />
              <Box icon={Users} label="Persons" value={data.tenant.persons} />
            </div>
          </div>
          <div className="rounded-2xl bg-card border border-border p-5">
            <div className="text-xs uppercase text-muted-foreground">My tenancy</div>
            <div className="mt-2 text-sm">Move-in: {new Date(data.tenant.move_in_date).toLocaleDateString("en-IN")}</div>
            {data.tenant.rent_share != null && <div className="text-sm">My share: {inr(data.tenant.rent_share)}</div>}
          </div>
        </div>
      )}
    </TenantShell>
  );
}

function Box({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: React.ReactNode }) {
  return <div className="rounded-lg bg-background border border-border p-2"><div className="flex items-center justify-center gap-1 text-[10px] uppercase text-muted-foreground"><Icon className="size-3" />{label}</div><div className="font-semibold mt-1">{value}</div></div>;
}
