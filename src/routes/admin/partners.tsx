import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  listPartnerOrgs,
  createPartnerOrg,
  addPartnerOrgMember,
} from "@/lib/admin-partners.functions";
import { Building2, Plus, Loader2, UserPlus, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/admin/partners")({ component: PartnersPage });

type Org = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  verified: boolean;
  created_at: string;
  partner_org_members: { user_id: string }[];
};

function PartnersPage() {
  const qc = useQueryClient();
  const list = useServerFn(listPartnerOrgs);
  const create = useServerFn(createPartnerOrg);
  const addMember = useServerFn(addPartnerOrgMember);

  const q = useQuery({ queryKey: ["partner-orgs"], queryFn: () => list() });

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [linkingOrg, setLinkingOrg] = useState<string | null>(null);
  const [linkEmail, setLinkEmail] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkErr, setLinkErr] = useState<string | null>(null);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await create({
        data: { name, contact_email: email || undefined, contact_phone: phone || undefined },
      });
      setName("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["partner-orgs"] });
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  };

  const submitLink = async (orgId: string) => {
    setLinkBusy(true);
    setLinkErr(null);
    try {
      await addMember({ data: { org_id: orgId, email: linkEmail } });
      setLinkEmail("");
      setLinkingOrg(null);
      qc.invalidateQueries({ queryKey: ["partner-orgs"] });
    } catch (e) {
      setLinkErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLinkBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Building2 className="size-5 text-primary" /> Partner organizations
        </h1>
        <p className="text-xs text-muted-foreground mt-1">
          Societies / property managers who bulk-sync their own inventory instead of using RentDesk
          directly.
        </p>
      </div>

      <form
        onSubmit={submitCreate}
        className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-2"
      >
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground">Organization name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="text-xs font-medium text-muted-foreground">Contact email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
          />
        </div>
        <div className="flex-1 min-w-[140px]">
          <label className="text-xs font-medium text-muted-foreground">Contact phone</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full px-3 py-2 rounded-lg bg-background border border-input text-sm"
          />
        </div>
        <button
          disabled={creating}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60"
        >
          {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{" "}
          Create
        </button>
      </form>

      {q.isLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (q.data?.orgs ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">No partner organizations yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {(q.data?.orgs ?? []).map((o: Org) => (
            <div key={o.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between">
                <div className="font-medium">{o.name}</div>
                {o.verified && <CheckCircle2 className="size-4 text-primary" />}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {o.contact_email || "—"} · {o.contact_phone || "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {o.partner_org_members.length} linked account(s)
              </div>

              {linkingOrg === o.id ? (
                <div className="mt-3 flex gap-2">
                  <input
                    type="email"
                    placeholder="landlord@email.com"
                    value={linkEmail}
                    onChange={(e) => setLinkEmail(e.target.value)}
                    className="flex-1 px-2.5 py-1.5 rounded-md bg-background border border-input text-xs"
                  />
                  <button
                    disabled={linkBusy}
                    onClick={() => submitLink(o.id)}
                    className="px-3 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-medium disabled:opacity-60"
                  >
                    {linkBusy ? <Loader2 className="size-3 animate-spin" /> : "Link"}
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setLinkingOrg(o.id);
                    setLinkErr(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  <UserPlus className="size-3" /> Link a landlord account
                </button>
              )}
              {linkingOrg === o.id && linkErr && (
                <div className="text-[11px] text-destructive mt-1">{linkErr}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
