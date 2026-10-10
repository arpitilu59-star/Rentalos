/**
 * Landlord/tenant document upload: validation + the upload orchestration.
 * Kept free of React so every failure path is unit-testable.
 *
 * Flow:  validate -> storage.upload (private bucket) -> save DB record.
 * If saving the record fails, the just-uploaded object is removed so we
 * never leave an orphan file that no record points at.
 */
export const KYC_BUCKET = "myr-kyc";
export const KYC_MAX_BYTES = 5 * 1024 * 1024;
export const KYC_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

export type KycField = "id_doc_path" | "selfie_path" | "property_doc_path";
export type KycKind = "landlord" | "tenant" | "property";

export type KycRecord = {
  id: string;
  kind: string;
  status: string;
  id_doc_path: string | null;
  selfie_path: string | null;
  property_doc_path: string | null;
  rejection_reason?: string | null;
  created_at: string;
};

/** Returns a user-facing error message, or null when the file is acceptable. */
export function validateKycFile(
  file: { name: string; size: number; type: string },
  field?: KycField,
): string | null {
  if (!file.size) return "This file is empty. Choose a different file.";
  if (file.size > KYC_MAX_BYTES) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). The limit is ${KYC_MAX_BYTES / 1024 / 1024} MB.`;
  }
  if (!KYC_MIME_TO_EXT[file.type]) {
    return "Unsupported file type. Upload a JPG, PNG, WebP or PDF.";
  }
  if (field === "selfie_path" && file.type === "application/pdf") {
    return "A selfie must be a photo (JPG, PNG or WebP), not a PDF.";
  }
  return null;
}

export function buildKycPath(
  userId: string,
  kind: KycKind,
  field: KycField,
  mime: string,
  uuid: string,
): string {
  // Extension comes from the validated MIME type, never from the user's filename.
  return `${userId}/${kind}-${field}-${uuid}.${KYC_MIME_TO_EXT[mime] ?? "bin"}`;
}

/** Translate raw storage / database errors into something a landlord can act on. */
export function friendlyUploadError(e: unknown): string {
  const raw =
    e instanceof Error
      ? e.message
      : typeof e === "object" && e && "message" in e
        ? String((e as { message: unknown }).message)
        : String(e ?? "");
  const m = raw.toLowerCase();
  if (m.includes("bucket not found"))
    return "Document storage isn't set up yet. Please contact support.";
  if (
    m.includes("row-level security") ||
    m.includes("not authorized") ||
    m.includes("permission")
  ) {
    return "You don't have permission to upload this document. Log in again and retry.";
  }
  if (m.includes("exceeded the maximum") || m.includes("too large") || m.includes("payload"))
    return "File is too large. The limit is 5 MB.";
  if (m.includes("mime") || m.includes("not allowed"))
    return "Unsupported file type. Upload a JPG, PNG, WebP or PDF.";
  if (m.includes("failed to fetch") || m.includes("network") || m.includes("load failed")) {
    return "Network problem. Check your connection and retry.";
  }
  return raw ? `Upload failed: ${raw}` : "Upload failed. Please retry.";
}

// Minimal structural types so tests can inject fakes (no supabase-js import).
type StorageApi = {
  upload: (
    path: string,
    file: File | Blob,
    opts?: { contentType?: string },
  ) => PromiseLike<{ error: { message: string } | null }>;
  remove: (paths: string[]) => PromiseLike<unknown>;
};
type Db = {
  insertRecord: (
    row: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
  updateRecord: (
    id: string,
    patch: Record<string, unknown>,
  ) => PromiseLike<{ error: { message: string } | null }>;
};

export type SubmitArgs = {
  storage: StorageApi;
  db: Db;
  userId: string;
  kind: KycKind;
  field: KycField;
  file: File;
  existing: KycRecord[]; // this user's records, newest first
  uuid?: string;
};

export type SubmitResult =
  { ok: true; path: string; mode: "updated" | "created" } | { ok: false; error: string };

/**
 * pending record exists  -> attach the file to it (update)
 * otherwise (none / verified / rejected) -> create a NEW pending record,
 *   carrying forward the other documents from the latest record, so the
 *   previous (decided) record is preserved untouched for audit.
 */
export async function submitKycDocument(a: SubmitArgs): Promise<SubmitResult> {
  const invalid = validateKycFile(a.file, a.field);
  if (invalid) return { ok: false, error: invalid };

  const path = buildKycPath(a.userId, a.kind, a.field, a.file.type, a.uuid ?? crypto.randomUUID());
  try {
    const { error: upErr } = await a.storage.upload(path, a.file, { contentType: a.file.type });
    if (upErr) return { ok: false, error: friendlyUploadError(upErr) };
  } catch (e) {
    return { ok: false, error: friendlyUploadError(e) };
  }

  const ofKind = a.existing.filter((r) => r.kind === a.kind);
  const pending = ofKind.find((r) => r.status === "pending");
  const latest = ofKind[0];

  let dbError: { message: string } | null = null;
  let mode: "updated" | "created" = "updated";
  try {
    if (pending) {
      ({ error: dbError } = await a.db.updateRecord(pending.id, { [a.field]: path }));
    } else {
      mode = "created";
      const carry: Record<string, unknown> = {};
      if (latest) {
        for (const f of ["id_doc_path", "selfie_path", "property_doc_path"] as const) {
          if (f !== a.field && latest[f]) carry[f] = latest[f];
        }
      }
      ({ error: dbError } = await a.db.insertRecord({
        user_id: a.userId,
        kind: a.kind,
        status: "pending",
        ...carry,
        [a.field]: path,
      }));
    }
  } catch (e) {
    dbError = { message: e instanceof Error ? e.message : "Database error" };
  }

  if (dbError) {
    try {
      await a.storage.remove([path]); // don't leave an orphan file
    } catch {
      /* best effort */
    }
    return {
      ok: false,
      error: `The file uploaded but we couldn't save it: ${friendlyUploadError(dbError).replace(/^Upload failed: /, "")}. Please retry.`,
    };
  }
  return { ok: true, path, mode };
}

/** Which record represents a document kind right now (newest first input). */
export function latestOfKind(records: KycRecord[], kind: KycKind): KycRecord | undefined {
  return records.find((r) => r.kind === kind);
}
