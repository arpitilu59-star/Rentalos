import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { ShieldCheck, Loader2, Upload } from "lucide-react";

export const Route = createFileRoute("/myr/landlord/verify")({ component: VerifyPage });

type V = {
  id: string;
  status: string;
  kind: string;
  id_doc_path: string | null;
  selfie_path: string | null;
  property_doc_path: string | null;
  created_at: string;
};

function VerifyPage() {
  const [items, setItems] = useState<V[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);

  const load = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase
      .from("myr_verifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setItems((data ?? []) as V[]);
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, []);

  const upload = async (
    field: "id_doc_path" | "selfie_path" | "property_doc_path",
    file: File,
    kind: "landlord" | "tenant" | "property",
  ) => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    setUploading(field);
    try {
      const path = `${user.id}/${kind}-${field}-${crypto.randomUUID()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("myr-kyc").upload(path, file);
      if (error) throw error;
      const existing = items.find((x) => x.kind === kind && x.status === "pending");
      const patch = { [field]: path } as {
        id_doc_path?: string;
        selfie_path?: string;
        property_doc_path?: string;
      };
      if (existing) {
        const { error: dbErr } = await supabase
          .from("myr_verifications")
          .update(patch)
          .eq("id", existing.id);
        if (dbErr) throw new Error(`File uploaded but saving the record failed: ${dbErr.message}`);
      } else {
        const { error: dbErr } = await supabase
          .from("myr_verifications")
          .insert({ user_id: user.id, kind, status: "pending", ...patch });
        if (dbErr) throw new Error(`File uploaded but saving the record failed: ${dbErr.message}`);
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  };

  return (
    <MyrShell variant="landlord">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="size-5 text-primary" />
        <h1 className="text-2xl font-semibold tracking-tight">Verification</h1>
      </div>
      {loading ? (
        <div className="py-20 grid place-items-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4 max-w-3xl">
          <Card
            title="Identity proof"
            desc="Aadhaar/PAN/Driving license"
            hint="JPG/PNG/PDF"
            status={statusFor(items, "landlord")}
          >
            <FileBtn
              busy={uploading === "id_doc_path"}
              onPick={(f) => upload("id_doc_path", f, "landlord")}
              label="Upload ID"
            />
          </Card>
          <Card
            title="Selfie"
            desc="Holding your ID"
            hint="JPG/PNG"
            status={statusFor(items, "landlord")}
          >
            <FileBtn
              busy={uploading === "selfie_path"}
              onPick={(f) => upload("selfie_path", f, "landlord")}
              label="Upload selfie"
            />
          </Card>
          <Card
            title="Property proof"
            desc="Ownership/utility bill"
            hint="PDF/JPG"
            status={statusFor(items, "property")}
          >
            <FileBtn
              busy={uploading === "property_doc_path"}
              onPick={(f) => upload("property_doc_path", f, "property")}
              label="Upload doc"
            />
          </Card>
        </div>
      )}
    </MyrShell>
  );
}

function statusFor(items: V[], kind: string) {
  const x = items.find((i) => i.kind === kind);
  return x?.status ?? "not_started";
}

function Card({
  title,
  desc,
  hint,
  status,
  children,
}: {
  title: string;
  desc: string;
  hint: string;
  status: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-card border border-border p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
        <div
          className={`text-[10px] uppercase font-medium px-2 py-0.5 rounded-full ${status === "verified" ? "bg-success text-success-foreground" : status === "pending" ? "bg-warning text-warning-foreground" : status === "rejected" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground"}`}
        >
          {status.replace("_", " ")}
        </div>
      </div>
      <div className="mt-3">{children}</div>
      <div className="mt-2 text-[10px] text-muted-foreground">{hint}</div>
    </div>
  );
}

function FileBtn({
  onPick,
  label,
  busy,
}: {
  onPick: (f: File) => void;
  label: string;
  busy: boolean;
}) {
  return (
    <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs cursor-pointer">
      {busy ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />} {label}
      <input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
        className="hidden"
      />
    </label>
  );
}
