import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";

export const Route = createFileRoute("/admin/audits")({ component: AuditsPage });

type Audit = { id: string; admin_user_id: string; action: string; target_type: string | null; target_id: string | null; metadata: unknown; ip_address: string | null; user_agent: string | null; created_at: string };
type Login = { id: string; email: string | null; ip_address: string | null; user_agent: string | null; success: boolean; device_fingerprint: string | null; created_at: string };

function AuditsPage() {
  const audits = useQuery<Audit[]>({
    queryKey: ["audit-logs-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_audit_logs").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Audit[];
    },
  });
  const logins = useQuery<Login[]>({
    queryKey: ["login-events-full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("admin_login_events").select("*").order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return data as Login[];
    },
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Audit &amp; Sign-in Logs</h1>

      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Admin actions (last 200)</div>
        {audits.isLoading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p> :
         (audits.data?.length ?? 0) === 0 ? <p className="p-4 text-xs text-muted-foreground">No actions recorded.</p> : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Action</th>
              <th className="text-left font-medium px-3 py-2">Target</th>
              <th className="text-left font-medium px-3 py-2">IP</th>
            </tr></thead>
            <tbody>
              {audits.data!.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-3 py-2">{new Date(a.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2 font-medium">{a.action}</td>
                  <td className="px-3 py-2">{a.target_type ?? "—"} {a.target_id ? `· ${a.target_id.slice(0, 8)}` : ""}</td>
                  <td className="px-3 py-2 text-muted-foreground">{a.ip_address ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="rounded-2xl bg-card border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border text-sm font-semibold">Admin sign-ins (last 200)</div>
        {logins.isLoading ? <p className="p-4 text-xs text-muted-foreground">Loading…</p> :
         (logins.data?.length ?? 0) === 0 ? <p className="p-4 text-xs text-muted-foreground">No sign-ins logged.</p> : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 text-muted-foreground"><tr>
              <th className="text-left font-medium px-3 py-2">When</th>
              <th className="text-left font-medium px-3 py-2">Email</th>
              <th className="text-left font-medium px-3 py-2">Result</th>
              <th className="text-left font-medium px-3 py-2">IP</th>
              <th className="text-left font-medium px-3 py-2">Device</th>
            </tr></thead>
            <tbody>
              {logins.data!.map((l) => (
                <tr key={l.id} className="border-t border-border">
                  <td className="px-3 py-2">{new Date(l.created_at).toLocaleString("en-IN")}</td>
                  <td className="px-3 py-2">{l.email ?? "—"}</td>
                  <td className="px-3 py-2">{l.success ? "✓ success" : "✗ failed"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{l.ip_address ?? "—"}</td>
                  <td className="px-3 py-2 text-muted-foreground truncate max-w-[260px]">{l.user_agent ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _kept = useEffect;
