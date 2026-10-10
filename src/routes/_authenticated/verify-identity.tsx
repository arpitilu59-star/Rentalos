import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { VerificationUploader } from "@/components/VerificationUploader";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/_authenticated/verify-identity")({
  component: VerifyIdentityPage,
});

function VerifyIdentityPage() {
  return (
    <AppShell>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Identity verification</h1>
      </div>
      <VerificationUploader />
    </AppShell>
  );
}
