import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Loader2,
  RefreshCw,
  Upload,
} from "lucide-react";
import {
  KYC_BUCKET,
  friendlyUploadError,
  latestOfKind,
  submitKycDocument,
  validateKycFile,
  type KycField,
  type KycKind,
  type KycRecord,
} from "@/lib/kyc-upload";

type Slot = { field: KycField; kind: KycKind; title: string; desc: string; hint: string };
const SLOTS: Slot[] = [
  {
    field: "id_doc_path",
    kind: "landlord",
    title: "Identity proof",
    desc: "Aadhaar, PAN or driving licence",
    hint: "JPG, PNG, WebP or PDF · max 5 MB",
  },
  {
    field: "selfie_path",
    kind: "landlord",
    title: "Selfie with ID",
    desc: "A clear photo of you holding your ID",
    hint: "JPG, PNG or WebP · max 5 MB",
  },
  {
    field: "property_doc_path",
    kind: "property",
    title: "Property proof",
    desc: "Ownership paper or a recent utility bill",
    hint: "JPG, PNG, WebP or PDF · max 5 MB",
  },
];

type SlotState = { busy: boolean; error: string | null; picked: string | null; retry: File | null };

function StatusBadge({ record, field }: { record?: KycRecord; field: KycField }) {
  const has = !!record?.[field];
  if (!record || !has)
    return (
      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
        Not uploaded
      </span>
    );
  if (record.status === "verified")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success px-2 py-0.5 text-[11px] text-success-foreground">
        <CheckCircle2 className="size-3" /> Approved
      </span>
    );
  if (record.status === "rejected")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[11px] text-destructive-foreground">
        <AlertCircle className="size-3" /> Rejected
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[11px] text-warning-foreground">
      <Clock className="size-3" /> Pending review
    </span>
  );
}

/** Shared by /verify-identity and /myr/landlord/verify. Documents are optional: publishing never waits on them. */
export function VerificationUploader() {
  const [records, setRecords] = useState<KycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [state, setState] = useState<Record<string, SlotState>>({});
  const lock = useRef(false); // one upload at a time -> no duplicate records
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setLoadError("You're signed out. Please log in again.");
        return;
      }
      const { data, error } = await supabase
        .from("myr_verifications")
        .select(
          "id, kind, status, id_doc_path, selfie_path, property_doc_path, rejection_reason, created_at",
        )
        .eq("user_id", auth.user.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setRecords((data ?? []) as KycRecord[]);
      setLoadError(null);
    } catch (e) {
      setLoadError(
        friendlyUploadError(e).replace(/^Upload failed: /, "Couldn't load your documents: "),
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const patch = (field: string, p: Partial<SlotState>) =>
    setState((s) => {
      const base: SlotState = s[field] ?? { busy: false, error: null, picked: null, retry: null };
      return { ...s, [field]: { ...base, ...p } };
    });

  const upload = async (slot: Slot, file: File) => {
    if (lock.current) return;
    const invalid = validateKycFile(file, slot.field);
    if (invalid) return patch(slot.field, { error: invalid, picked: file.name, retry: null });
    lock.current = true;
    patch(slot.field, { busy: true, error: null, picked: file.name, retry: null });
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authorized — please log in again.");
      const res = await submitKycDocument({
        storage: supabase.storage.from(KYC_BUCKET),
        db: {
          insertRecord: (row) => supabase.from("myr_verifications").insert(row as never),
          updateRecord: (id, p) =>
            supabase
              .from("myr_verifications")
              .update(p as never)
              .eq("id", id),
        },
        userId: auth.user.id,
        kind: slot.kind,
        field: slot.field,
        file,
        existing: records,
      });
      if (!res.ok) return patch(slot.field, { error: res.error, retry: file });
      patch(slot.field, { picked: null });
      await load(); // re-read so the UI reflects what is actually saved
    } catch (e) {
      patch(slot.field, { error: friendlyUploadError(e), retry: file });
    } finally {
      lock.current = false;
      patch(slot.field, { busy: false });
    }
  };

  const view = async (path: string) => {
    const { data, error } = await supabase.storage.from(KYC_BUCKET).createSignedUrl(path, 300);
    if (error || !data) return alert("Couldn't open this document. Please try again.");
    window.open(data.signedUrl, "_blank", "noopener");
  };

  if (loading)
    return (
      <div className="grid place-items-center py-20">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );

  return (
    <div className="max-w-3xl space-y-4">
      <p className="max-w-lg text-sm text-muted-foreground">
        Documents are optional — you can publish your listings without them. Uploading lets our team
        review and approve your identity.
      </p>
      {loadError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-destructive/40 p-3 text-sm text-destructive"
        >
          <span>{loadError}</span>
          <button className="inline-flex items-center gap-1 underline" onClick={() => void load()}>
            <RefreshCw className="size-3" /> Retry
          </button>
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        {SLOTS.map((slot) => {
          const record = latestOfKind(records, slot.kind);
          const path = record?.[slot.field] ?? null;
          const st = state[slot.field];
          const busy = !!st?.busy;
          return (
            <div key={slot.field} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">
                    {slot.title}{" "}
                    <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{slot.desc}</div>
                </div>
                <StatusBadge record={record} field={slot.field} />
              </div>
              {record?.status === "rejected" && path && record.rejection_reason && (
                <p className="mt-2 text-xs text-destructive">Reason: {record.rejection_reason}</p>
              )}
              {st?.picked && (
                <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="size-3" /> {st.picked}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => inputs.current[slot.field]?.click()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground disabled:opacity-60"
                >
                  {busy ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <Upload className="size-3" />
                  )}
                  {busy ? "Uploading…" : path ? "Replace" : "Upload"}
                </button>
                {path && !busy && (
                  <button
                    type="button"
                    onClick={() => void view(path)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    <Eye className="size-3" /> View
                  </button>
                )}
                {st?.retry && !busy && (
                  <button
                    type="button"
                    onClick={() => void upload(slot, st.retry!)}
                    className="inline-flex items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent"
                  >
                    <RefreshCw className="size-3" /> Retry
                  </button>
                )}
                <input
                  ref={(el) => {
                    inputs.current[slot.field] = el;
                  }}
                  type="file"
                  className="hidden"
                  accept={
                    slot.field === "selfie_path"
                      ? "image/jpeg,image/png,image/webp"
                      : "image/jpeg,image/png,image/webp,application/pdf"
                  }
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = ""; // allow re-picking the same file
                    if (f) void upload(slot, f);
                  }}
                />
              </div>
              {st?.error && (
                <p role="alert" className="mt-2 text-xs text-destructive">
                  {st.error}
                </p>
              )}
              <div className="mt-2 text-[10px] text-muted-foreground">{slot.hint}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
