import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { NotifList } from "@/routes/tenant/$tenantId.notifications";

export const Route = createFileRoute("/_authenticated/notifications")({ component: Page });

function Page() {
  return (
    <AppShell>
      <NotifList />
    </AppShell>
  );
}
