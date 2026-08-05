import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminListUsers, adminListTenants } from "@/lib/admin.functions";
import { useState } from "react";

export const Route = createFileRoute("/admin/users")({ component: AdminUsers });

function AdminUsers() {
  const [tab, setTab] = useState<"landlords" | "tenants">("landlords");
  const fetchUsers = useServerFn(adminListUsers);
  const fetchTenants = useServerFn(adminListTenants);
  const users = useQuery({ queryKey: ["admin-users"], queryFn: () => fetchUsers(), enabled: tab === "landlords" });
  const tenants = useQuery({ queryKey: ["admin-tenants"], queryFn: () => fetchTenants(), enabled: tab === "tenants" });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">All Users</h1>
        <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
          {(["landlords", "tenants"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md capitalize ${tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-2xl bg-card border border-border overflow-hidden">
        {tab === "landlords" ? (
          users.isLoading ? <P>Loading…</P> :
          (users.data?.length ?? 0) === 0 ? <P>No landlords yet.</P> : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr><Th>Name</Th><Th>Email</Th><Th>Phone</Th><Th>City</Th><Th>Joined</Th></tr>
              </thead>
              <tbody>
                {users.data!.map((u) => (
                  <tr key={u.id} className="border-t border-border">
                    <Td>{u.full_name ?? "—"}</Td><Td>{u.email ?? "—"}</Td>
                    <Td>{u.phone ?? "—"}</Td><Td>{u.city ?? "—"}</Td>
                    <Td>{new Date(u.created_at).toLocaleDateString("en-IN")}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          tenants.isLoading ? <P>Loading…</P> :
          (tenants.data?.length ?? 0) === 0 ? <P>No tenants yet.</P> : (
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr><Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Persons</Th><Th>Move-in</Th><Th>Active</Th></tr>
              </thead>
              <tbody>
                {tenants.data!.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <Td>{t.name}</Td><Td>{t.phone}</Td><Td>{t.email ?? "—"}</Td>
                    <Td>{t.persons}</Td><Td>{new Date(t.move_in_date).toLocaleDateString("en-IN")}</Td>
                    <Td>{t.active ? "Yes" : "No"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>
    </div>
  );
}

const Th = ({ children }: { children: React.ReactNode }) => <th className="text-left font-medium px-3 py-2">{children}</th>;
const Td = ({ children }: { children: React.ReactNode }) => <td className="px-3 py-2 align-top">{children}</td>;
const P = ({ children }: { children: React.ReactNode }) => <p className="text-xs text-muted-foreground p-4">{children}</p>;
