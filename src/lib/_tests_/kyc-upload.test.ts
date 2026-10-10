import { describe, it, expect, vi } from "vitest";
import type { SubmitArgs } from "../kyc-upload";
import {
  validateKycFile,
  buildKycPath,
  friendlyUploadError,
  submitKycDocument,
  KYC_MAX_BYTES,
  type KycRecord,
} from "../kyc-upload";

const file = (name: string, type: string, size = 1000) => ({ name, type, size }) as File;
const rec = (o: Partial<KycRecord>): KycRecord => ({
  id: "r1",
  kind: "landlord",
  status: "pending",
  id_doc_path: null,
  selfie_path: null,
  property_doc_path: null,
  created_at: "2026-01-01",
  ...o,
});

describe("validateKycFile", () => {
  it("accepts jpg/png/webp/pdf up to 5MB", () => {
    for (const t of ["image/jpeg", "image/png", "image/webp", "application/pdf"])
      expect(validateKycFile(file("a", t))).toBeNull();
    expect(validateKycFile(file("a", "application/pdf", KYC_MAX_BYTES))).toBeNull();
  });
  it("rejects oversized, empty, unsupported and PDF selfies with clear messages", () => {
    expect(validateKycFile(file("a", "image/png", KYC_MAX_BYTES + 1))).toMatch(/too large/);
    expect(validateKycFile(file("a", "image/png", 0))).toMatch(/empty/);
    expect(validateKycFile(file("a.exe", "application/x-msdownload"))).toMatch(/Unsupported/);
    expect(validateKycFile(file("a.gif", "image/gif"))).toMatch(/Unsupported/);
    expect(validateKycFile(file("s.pdf", "application/pdf"), "selfie_path")).toMatch(/selfie/);
  });
});

describe("buildKycPath", () => {
  it("is scoped to the user folder and ignores the user's filename/extension", () => {
    expect(buildKycPath("u1", "landlord", "id_doc_path", "application/pdf", "x")).toBe(
      "u1/landlord-id_doc_path-x.pdf",
    );
  });
});

describe("friendlyUploadError", () => {
  it.each([
    ["Bucket not found", /storage isn't set up/],
    ["new row violates row-level security policy", /permission/],
    ["TypeError: Failed to fetch", /Network/],
    ["The object exceeded the maximum allowed size", /too large/],
    ["mime type image/gif is not supported", /Unsupported/],
  ])("%s", (raw, re) => expect(friendlyUploadError(new Error(raw))).toMatch(re));
});

function deps(over: { upload?: unknown; insert?: unknown; update?: unknown } = {}) {
  const ok = { error: null };
  const storage = { upload: vi.fn(async () => over.upload ?? ok), remove: vi.fn(async () => ({})) };
  const db = {
    insertRecord: vi.fn(async () => over.insert ?? ok),
    updateRecord: vi.fn(async () => over.update ?? ok),
  };
  return { storage, db, as: { storage, db } as unknown as Pick<SubmitArgs, "storage" | "db"> };
}

describe("submitKycDocument", () => {
  const base = {
    userId: "u1",
    kind: "landlord" as const,
    field: "id_doc_path" as const,
    file: file("id.pdf", "application/pdf"),
    uuid: "z",
  };

  it("no record yet -> uploads then INSERTS a pending record", async () => {
    const d = deps();
    const r = await submitKycDocument({ ...base, ...d.as, existing: [] });
    expect(r).toMatchObject({ ok: true, mode: "created" });
    expect(d.db.insertRecord).toHaveBeenCalledWith({
      user_id: "u1",
      kind: "landlord",
      status: "pending",
      id_doc_path: "u1/landlord-id_doc_path-z.pdf",
    });
  });
  it("pending record -> attaches the file by UPDATE (no duplicate record)", async () => {
    const d = deps();
    const r = await submitKycDocument({ ...base, ...d.as, existing: [rec({ id: "p1" })] });
    expect(r).toMatchObject({ ok: true, mode: "updated" });
    expect(d.db.updateRecord).toHaveBeenCalledWith("p1", {
      id_doc_path: "u1/landlord-id_doc_path-z.pdf",
    });
    expect(d.db.insertRecord).not.toHaveBeenCalled();
  });
  it("rejected record -> new pending record, other docs carried forward, old record untouched", async () => {
    const d = deps();
    await submitKycDocument({
      ...base,
      ...d.as,
      existing: [
        rec({ status: "rejected", selfie_path: "u1/old-selfie.jpg", id_doc_path: "u1/old-id.jpg" }),
      ],
    });
    expect(d.db.updateRecord).not.toHaveBeenCalled();
    expect(d.db.insertRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "pending",
        selfie_path: "u1/old-selfie.jpg",
        id_doc_path: "u1/landlord-id_doc_path-z.pdf",
      }),
    );
  });
  it("verified record is never modified; a new pending record is created", async () => {
    const d = deps();
    await submitKycDocument({ ...base, ...d.as, existing: [rec({ status: "verified" })] });
    expect(d.db.updateRecord).not.toHaveBeenCalled();
  });
  it("invalid file never reaches storage", async () => {
    const d = deps();
    const r = await submitKycDocument({
      ...base,
      ...d.as,
      file: file("x.exe", "application/x-msdownload"),
      existing: [],
    });
    expect(r).toMatchObject({ ok: false });
    expect(d.storage.upload).not.toHaveBeenCalled();
  });
  it("storage failure -> friendly error, no DB write", async () => {
    const d = deps({ upload: { error: { message: "Bucket not found" } } });
    const r = await submitKycDocument({ ...base, ...d.as, existing: [] });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/storage isn't set up/) });
    expect(d.db.insertRecord).not.toHaveBeenCalled();
  });
  it("storage throws (network) -> recoverable error", async () => {
    const d = deps();
    d.storage.upload.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    expect(await submitKycDocument({ ...base, ...d.as, existing: [] })).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Network/),
    });
  });
  it("DB failure after upload -> orphan file removed + clear error", async () => {
    const d = deps({
      insert: { error: { message: "new row violates row-level security policy" } },
    });
    const r = await submitKycDocument({ ...base, ...d.as, existing: [] });
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/couldn't save it/) });
    expect(d.storage.remove).toHaveBeenCalledWith(["u1/landlord-id_doc_path-z.pdf"]);
  });
});
