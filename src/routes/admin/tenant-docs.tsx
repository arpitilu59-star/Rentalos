import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { adminListTenantDocs, adminReviewTenantDoc } from "@/lib/admin-tenant-docs.functions";

export const Route = createFileRoute("/admin/tenant-docs")({ component: TenantDocs });

const LABEL: Record<string, string> = {
  aadhaar: "Aadhaar", pan: "PAN", driving_license: "Driving licence", voter_id: "Voter ID",
  passport: "Passport", college_id: "College / office ID", photo: "Selfie / photo",
};
const STATUS = ["pending", "verified", "rejected"] as const;

function TenantDocs() {
  const list = useServerFn(adminListTenantDocs);
  const review = useServerFn(adminReviewTenantDoc);
  const qc = useQueryClient();
  const [status, setStatus] = useState<(typeof STATUS)[number]>("pending");
  const [note, setNote] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["admin-tenant-docs", status], queryFn: () => list({ data: { status } }), retry: false });
  const m = useMutation({
    mutationFn: (v: { id: string; decision: "verified" | "rejected"; note?: string }) => review({ data: v }),
    onSuccess: () => { setErr(null); qc.invalidateQueries({ queryKey: ["admin-tenant-docs"] }); },
    onError: (e) => setErr(e instanceof Error ? e.message : "Couldn't save. Please try again."),
  });
  const pill = (on: boolean) => `px-2.5 py-1 rounded-full text-xs border ${on ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Tenant documents</h1>
        <p className="text-sm text-muted-foreground">Check that the ID photo is clear and matches the tenant, then verify. A tenant with a verified ID gets the "Verified tenant" badge. Images open in a short-lived private link.</p>
      </div>
      <div className="flex gap-1.5">{STATUS.map((s) => <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>{s}</button>)}</div>
      {err && <p role="alert" className="text-sm text-destructive">{err}</p>}
      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : q.isError ? (
        <p className="text-sm text-destructive">{q.error instanceof Error ? q.error.message : "Couldn't load documents."}</p>
      ) : q.data!.length === 0 ? <p className="text-sm text-muted-foreground">Nothing here.</p> : (
        <div className="grid gap-3 md:grid-cols-2">
          {q.data!.map((d) => (
            <div key={d.id} className="rounded-xl border border-border bg-card p-4 space-y-3 text-sm">
              <div className="flex justify-between gap-2">
                <div>
                  <div className="font-medium">{d.name ?? "Unnamed tenant"}</div>
                  <div className="text-xs text-muted-foreground">{d.mobile ?? "no mobile"} · {d.email ?? ""}</div>
                </div>
                <span className="text-[11px] rounded-full bg-muted px-2 py-0.5 h-fit">{LABEL[d.docType] ?? d.docType}</span>
              </div>
              {d.url ? <a href={d.url} target="_blank" rel="noreferrer"><img src={d.url} alt={d.docType} className="w-full max-h-72 object-contain rounded-lg border border-border bg-muted" /></a> : <p className="text-xs text-destructive">File missing.</p>}
              <div className="text-xs text-muted-foreground">Uploaded {new Date(d.createdAt).toLocaleString("en-IN")}{d.note ? ` · note: ${d.note}` : ""}</div>
              {status === "pending" && (
                <div className="space-y-2">
                  <input value={note[d.id] ?? ""} onChange={(e) => setNote((p) => ({ ...p, [d.id]: e.target.value }))} placeholder="Reason (required to reject)" className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm" />
                  <div className="flex gap-2">
                    <button disabled={m.isPending} onClick={() => m.mutate({ id: d.id, decision: "verified", note: note[d.id] })} className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs disabled:opacity-50">Verify</button>
                    <button disabled={m.isPending} onClick={() => m.mutate({ id: d.id, decision: "rejected", note: note[d.id] })} className="px-3 py-1.5 rounded-md border border-border text-xs disabled:opacity-50">Reject</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
