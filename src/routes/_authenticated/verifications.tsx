import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/AppShell";
import { supabase } from "@/integrations/supabase/client";
import { createVerification, listVerifications } from "@/lib/landlord-ops.functions";
import { ShieldCheck, Upload, Loader2, FileText } from "lucide-react";

export const Route = createFileRoute("/_authenticated/verifications")({
  component: VerificationsPage,
});

type Doc = { doc_type: string; storage_path: string };
type VerificationRow = {
  id: string;
  kind: string;
  status: string;
  notes: string | null;
  rejection_reason: string | null;
  tenants?: { name?: string } | null;
  verification_documents?: unknown[];
};

// NOTE: "landlord" identity verification for MYR/Rentalos marketplace
// publishing now lives exclusively at /myr/landlord/verify, backed by
// the myr_verifications table + myr-kyc bucket — that is the single
// source of truth checked by publishProperty/publishRoom. This page
// keeps its original purpose (a landlord tracking tenant & property
// verification requests) but no longer offers "landlord" as a kind,
// and no longer shows Verify/Reject controls — this page was never an
// admin-only route, so no authenticated user here should be able to
// decide any verification's outcome (that's also now enforced
// server-side in reviewVerification, and by RLS as a second layer).
function VerificationsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(listVerifications);
  const create = useServerFn(createVerification);

  const list = useQuery({ queryKey: ["verifications"], queryFn: () => fetchList() });

  const [kind, setKind] = useState<"tenant" | "property">("tenant");
  const [tenantId, setTenantId] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [notes, setNotes] = useState("");
  const [docs, setDocs] = useState<Doc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const upload = async (e: React.ChangeEvent<HTMLInputElement>, doc_type: string) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true);
    setErr(null);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not signed in");
      const path = `${u.user.id}/${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.]/g, "_")}`;
      const { error } = await supabase.storage
        .from("verification-docs")
        .upload(path, f, { upsert: false });
      if (error) throw error;
      setDocs((d) => [...d, { doc_type, storage_path: path }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await create({
        data: {
          kind,
          tenant_id: kind === "tenant" && tenantId ? tenantId : null,
          property_id: kind === "property" && propertyId ? propertyId : null,
          notes,
          documents: docs,
        },
      });
      setDocs([]);
      setNotes("");
      setTenantId("");
      setPropertyId("");
      qc.invalidateQueries({ queryKey: ["verifications"] });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldCheck className="size-6 text-primary" /> Verifications
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tenant & property verification with documents. (Your own landlord identity verification
            for the MYR marketplace is at Verify Identity, under Landlord.)
          </p>
        </header>

        <div className="rounded-2xl bg-card border border-border p-5 shadow-card space-y-3">
          <div className="font-semibold text-sm">New verification</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {(["tenant", "property"] as const).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`px-3 py-2 rounded-lg border text-sm capitalize ${kind === k ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border"}`}
              >
                {k}
              </button>
            ))}
          </div>
          {kind === "tenant" && (
            <input
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              placeholder="Tenant ID (UUID)"
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm font-mono"
            />
          )}
          {kind === "property" && (
            <input
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              placeholder="Property ID (UUID)"
              className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm font-mono"
            />
          )}
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Notes (optional)"
            rows={2}
            className="w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
          />

          <div className="grid sm:grid-cols-2 gap-2">
            {(kind === "tenant"
              ? ["aadhaar", "pan", "dl", "profile_photo"]
              : ["ownership", "property_photo"]
            ).map((t) => (
              <label
                key={t}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-border text-xs cursor-pointer hover:bg-accent"
              >
                <Upload className="size-3.5" /> Upload {t.replace("_", " ")}
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => upload(e, t)}
                  className="hidden"
                />
              </label>
            ))}
          </div>
          {docs.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-1">
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <FileText className="size-3" /> {d.doc_type}: {d.storage_path.split("/").pop()}
                </div>
              ))}
            </div>
          )}
          {err && <p className="text-xs text-destructive">{err}</p>}
          <button
            onClick={submit}
            disabled={busy || uploading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
          >
            {(busy || uploading) && <Loader2 className="size-4 animate-spin" />} Submit verification
          </button>
        </div>

        {/* Existing — status only. No Verify/Reject here: this page is
            not an admin-only route, so no one viewing it should be able
            to decide an outcome — that only happens through an admin
            review screen, server-side authorized. */}
        <div className="space-y-2">
          <div className="font-semibold text-sm">All verifications</div>
          {list.isLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : (list.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No verifications yet.</p>
          ) : (
            (list.data?.items ?? []).map((v: VerificationRow) => (
              <div key={v.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-accent">
                    {v.kind}
                  </span>
                  {v.tenants?.name && <span>{v.tenants.name}</span>}
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded ${v.status === "verified" ? "bg-emerald-500/10 text-emerald-600" : v.status === "rejected" ? "bg-destructive/10 text-destructive" : "bg-amber-500/10 text-amber-600"}`}
                  >
                    {v.status}
                  </span>
                </div>
                {v.notes && <div className="text-xs text-muted-foreground mt-1">{v.notes}</div>}
                {v.rejection_reason && (
                  <div className="text-xs text-destructive mt-1">Reason: {v.rejection_reason}</div>
                )}
                <div className="text-[11px] text-muted-foreground mt-1">
                  {v.verification_documents?.length ?? 0} document(s)
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
