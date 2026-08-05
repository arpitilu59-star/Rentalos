import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MyrShell } from "@/components/MyrShell";
import { MessageSquare, Loader2, Send } from "lucide-react";

export const Route = createFileRoute("/myr/messages")({ component: MessagesPage });

type Thread = {
  id: string; listing_id: string; tenant_id: string; landlord_id: string;
  last_message: string | null; updated_at: string;
  myr_listings: { title: string } | null;
};
type Msg = { id: string; sender_id: string; body: string; created_at: string };

function MessagesPage() {
  const nav = useNavigate();
  const [me, setMe] = useState<string>("");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { nav({ to: "/login" }); return; }
      setMe(session.user.id);
      const { data } = await supabase.from("myr_inquiries")
        .select("id,listing_id,tenant_id,landlord_id,last_message,updated_at, myr_listings(title)")
        .or(`tenant_id.eq.${session.user.id},landlord_id.eq.${session.user.id}`)
        .order("updated_at", { ascending: false });
      const t = (data ?? []) as unknown as Thread[];
      setThreads(t);
      if (t[0]) setActive(t[0].id);
      setLoading(false);
    })();
  }, [nav]);

  useEffect(() => {
    if (!active) return;
    (async () => {
      const { data } = await supabase.from("myr_inquiry_messages")
        .select("id,sender_id,body,created_at")
        .eq("inquiry_id", active)
        .order("created_at");
      setMsgs((data ?? []) as Msg[]);
    })();
  }, [active]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!active || !text.trim()) return;
    const body = text.trim();
    setText("");
    await supabase.from("myr_inquiry_messages").insert({ inquiry_id: active, sender_id: me, body });
    await supabase.from("myr_inquiries").update({ last_message: body, updated_at: new Date().toISOString() }).eq("id", active);
    const { data } = await supabase.from("myr_inquiry_messages").select("id,sender_id,body,created_at").eq("inquiry_id", active).order("created_at");
    setMsgs((data ?? []) as Msg[]);
  };

  return (
    <MyrShell variant="tenant">
      <div className="flex items-center gap-2 mb-4"><MessageSquare className="size-5" /><h1 className="text-2xl font-semibold tracking-tight">Messages</h1></div>
      {loading ? (
        <div className="py-20 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
      ) : threads.length === 0 ? (
        <div className="py-20 text-center text-sm text-muted-foreground">No conversations yet.</div>
      ) : (
        <div className="grid md:grid-cols-[260px_1fr] gap-4">
          <div className="rounded-2xl bg-card border border-border divide-y divide-border max-h-[70vh] overflow-y-auto">
            {threads.map((t) => (
              <button key={t.id} onClick={() => setActive(t.id)} className={`w-full text-left p-3 ${active === t.id ? "bg-accent" : "hover:bg-accent/50"}`}>
                <div className="text-sm font-medium truncate">{t.myr_listings?.title || "Listing"}</div>
                <div className="text-xs text-muted-foreground truncate">{t.last_message || "—"}</div>
              </button>
            ))}
          </div>
          <div className="rounded-2xl bg-card border border-border flex flex-col max-h-[70vh]">
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {msgs.map((m) => (
                <div key={m.id} className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${m.sender_id === me ? "ml-auto bg-primary text-primary-foreground" : "bg-muted"}`}>{m.body}</div>
              ))}
              {msgs.length === 0 && <div className="text-xs text-muted-foreground text-center py-10">Send the first message…</div>}
            </div>
            <form onSubmit={send} className="border-t border-border p-2 flex gap-2">
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message…" className="flex-1 px-3 py-2 rounded-xl bg-background border border-input text-sm outline-none focus:ring-2 ring-ring/40" />
              <button className="px-3 py-2 rounded-xl bg-primary text-primary-foreground"><Send className="size-4" /></button>
            </form>
          </div>
        </div>
      )}
    </MyrShell>
  );
}
