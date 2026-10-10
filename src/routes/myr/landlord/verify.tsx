import { createFileRoute } from "@tanstack/react-router";
import { MyrShell } from "@/components/MyrShell";
import { VerificationUploader } from "@/components/VerificationUploader";
import { ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/verify")({ component: VerifyPage });

function VerifyPage() {
  return (
    <MyrShell variant="landlord">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Verification</h1>
      </div>
      <VerificationUploader />
    </MyrShell>
  );
}
