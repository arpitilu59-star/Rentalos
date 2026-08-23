import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listMyrVerifications,
  decideMyrVerification,
  signMyrDocUrl,
} from "@/lib/myr-admin.functions";
import { ShieldCheck, Check, X, Eye, Loader2 } from "lucide-react";

export const Route = createFileRoute("/admin/myr-verifications")({ component: MyrVerifications });

function MyrVerifications() {
  const qc = useQueryClient();
  const list = useServerFn(listMyrVerifications);
  const decide = useServerFn(decideMyrVerification);
  const sign = useServerFn(signMyrDocUrl);
  const [status, setStatus] = useState<"pending" | "verified" | "rejected">("pending");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["myr-verifications", status],
    queryFn: () => list({ data: { status } }),
  });

  const open = async (verification_id: string, field: "id_doc" | "selfie" | "property_doc") => {
    try {
      const { url } = await sign({ data: { verification_id, field } });
      window.open(url, "_blank");
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    }
  };

  const act = async (id: string, decision: "verified" | "rejected") => {
    const reason =
      decision === "rejected" ? (prompt("Reason for rejection?") ?? undefined) : undefined;
    setBusy(id);
    try {
      await decide({ data: { id, decision, reason } });
      await qc.invalidateQueries({ queryKey: ["myr-verifications"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-primary" />
          <h1 className="text-xl font-semibold tracking-tight">MYR Verifications</h1>
        </div>
        <div className="flex gap-1 text-xs">
          {(["pending", "verified", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-3 py-1.5 rounded-md capitalize ${status === s ? "bg-primary text-primary-foreground" : "bg-card border border-border hover:bg-accent"}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !data?.rows?.length ? (
        <div className="py-20 text-center text-sm text-muted-foreground">
          No {status} verifications.
        </div>
      ) : (
        <div className="space-y-2">
          {data.rows.map(
            (r: {
              id: string;
              user_id: string;
              kind: string;
              status: string;
              created_at: string;
              id_doc_path: string | null;
              selfie_path: string | null;
              property_doc_path: string | null;
              rejection_reason: string | null;
              profile: { full_name: string | null; email: string | null } | null;
            }) => (
              <div key={r.id} className="rounded-2xl bg-card border border-border p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {r.profile?.full_name || r.profile?.email || r.user_id.slice(0, 8)}
                      <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                        {r.kind}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{r.profile?.email}</div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div
                    className={`text-[10px] uppercase px-2 py-0.5 rounded-full ${r.status === "verified" ? "bg-success text-success-foreground" : r.status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"}`}
                  >
                    {r.status}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["ID", "id_doc" as const, r.id_doc_path],
                      ["Selfie", "selfie" as const, r.selfie_path],
                      ["Property", "property_doc" as const, r.property_doc_path],
                    ] as const
                  ).map(([label, field, path]) =>
                    path ? (
                      <button
                        key={label}
                        onClick={() => open(r.id, field)}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-accent"
                      >
                        <Eye className="size-3" /> {label}
                      </button>
                    ) : (
                      <span
                        key={label}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-md border border-dashed border-border text-muted-foreground"
                      >
                        {label}: Not uploaded
                      </span>
                    ),
                  )}
                </div>
                {r.rejection_reason && (
                  <div className="mt-2 text-xs text-destructive">Reason: {r.rejection_reason}</div>
                )}
                {r.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "verified")}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-success text-success-foreground disabled:opacity-50"
                    >
                      <Check className="size-3.5" /> Approve
                    </button>
                    <button
                      disabled={busy === r.id}
                      onClick={() => act(r.id, "rejected")}
                      className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-md bg-destructive text-destructive-foreground disabled:opacity-50"
                    >
                      <X className="size-3.5" /> Reject
                    </button>
                  </div>
                )}
              </div>
            ),
          )}
        </div>
      )}
    </div>
  );
}
