import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminListAdmins, adminCreateAdmin, adminRevokeAdmin } from "@/lib/admin.functions";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/admins")({ component: AdminsPage });

const ROLES = ["full_admin", "support_admin", "subscription_admin", "property_admin", "finance_admin"] as const;

function AdminsPage() {
  const qc = useQueryClient();
  const fetchList = useServerFn(adminListAdmins);
  const createFn = useServerFn(adminCreateAdmin);
  const revokeFn = useServerFn(adminRevokeAdmin);
  const list = useQuery({ queryKey: ["admins-list"], queryFn: () => fetchList() });

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<typeof ROLES[number]>("support_admin");

  const create = useMutation({
    mutationFn: () => createFn({ data: { email, role } }),
    onSuccess: () => { toast.success("Admin added"); setEmail(""); qc.invalidateQueries({ queryKey: ["admins-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => revokeFn({ data: { admin_user_row_id: id } }),
    onSuccess: () => { toast.success("Revoked"); qc.invalidateQueries({ queryKey: ["admins-list"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Manage Admins</h1>

      <section className="rounded-2xl bg-card border border-border p-4 space-y-3">
        <h2 className="text-sm font-semibold">Add new admin</h2>
        <p className="text-xs text-muted-foreground">User must already have signed up with this email.</p>
        <div className="flex flex-wrap gap-2">
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="email@example.com"
            className="flex-1 min-w-[200px] px-3 py-2 rounded-lg bg-background border border-input text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value as typeof ROLES[number])}
            className="px-3 py-2 rounded-lg bg-background border border-input text-sm">
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, " ")}</option>)}
          </select>
          <button onClick={() => create.mutate()} disabled={!email || create.isPending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-60">
            Add
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">All admins</div>
        {list.isLoading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p> :
          (list.data?.length ?? 0) === 0 ? <p className="p-4 text-xs text-muted-foreground">No admins.</p> : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="text-left font-medium px-3 py-2">User ID</th>
              <th className="text-left font-medium px-3 py-2">Role</th>
              <th className="text-left font-medium px-3 py-2">Active</th>
              <th className="text-left font-medium px-3 py-2">Created</th>
              <th className="px-3 py-2" />
            </tr></thead>
            <tbody>
              {list.data!.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2 font-mono">{a.user_id.slice(0, 12)}…</td>
                  <td className="px-3 py-2">{a.role.replace(/_/g, " ")}</td>
                  <td className="px-3 py-2">{a.active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{new Date(a.created_at).toLocaleDateString("en-IN")}</td>
                  <td className="px-3 py-2 text-right">
                    {a.role !== "root_owner" && a.active && (
                      <button onClick={() => revoke.mutate(a.id)} className="text-destructive hover:underline">Revoke</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
