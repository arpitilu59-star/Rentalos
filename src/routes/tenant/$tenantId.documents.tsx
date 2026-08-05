import { createFileRoute } from "@tanstack/react-router";
import { TenantShell } from "@/components/TenantShell";
import { FileText } from "lucide-react";

export const Route = createFileRoute("/tenant/$tenantId/documents")({ component: Page });

function Page() {
  return (
    <TenantShell>
      <div className="flex items-center gap-2 mb-4"><FileText className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Documents</h1></div>
      <div className="rounded-2xl bg-card border border-border p-8 text-center text-sm text-muted-foreground max-w-xl">
        Agreement, ID proofs and rent receipts yahaan dikhenge. Aap landlord se documents request kar sakte hain — soon enabling tenant uploads.
      </div>
    </TenantShell>
  );
}
