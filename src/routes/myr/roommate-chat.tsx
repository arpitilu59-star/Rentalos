import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listRoommateThreads,
  getRoommateThread,
  sendRoommateMessage,
  respondRoommateRequest,
  startRoommateCall,
} from "@/lib/roommate-chat.functions";
import { ArrowLeft, Loader2, Send, Video, X, Check, Ban } from "lucide-react";

export const Route = createFileRoute("/myr/roommate-chat")({
  component: Page,
  validateSearch: (s: Record<string, unknown>) => ({ t: typeof s.t === "string" ? s.t : undefined }),
  head: () => ({ meta: [{ title: "Roommate chat — RentalOS" }] }),
});

function Page() {
  const { t } = Route.useSearch();
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link to="/myr/roommates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Roommates
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-3">Roommate chat</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Baat-cheet aur video call yahin app ke andar hoti hai — aapka phone number ya email share nahi hota.
        </p>
        {t ? <ThreadView id={t} /> : <ThreadList />}
      </div>
    </div>
  );
}

function ThreadList() {
  const list = useServerFn(listRoommateThreads);
  const { data, isLoading, error } = useQuery({ queryKey: ["rm-threads"], queryFn: () => list(), refetchInterval: 15000 });
  if (isLoading) return <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <div className="mt-6 text-sm text-destructive">{(error as Error).message}</div>;
  if (!data?.length)
    return (
      <div className="mt-6 rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Abhi koi chat nahi. <Link to="/myr/roommates" className="text-primary underline">Roommate matches</Link> se kisi ko message bhejein.
      </div>
    );
  return (
    <div className="mt-6 space-y-2">
      {data.map((th) => (
        <Link key={th.id} to="/myr/roommate-chat" search={{ t: th.id }} className="block rounded-2xl bg-card border border-border p-4 hover:bg-accent/50">
          <div className="flex items-center justify-between gap-2">
            <div className="font-medium truncate">{th.name}</div>
            {th.incoming && <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary text-primary-foreground">New request</span>}
            {th.outgoing && <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted">Waiting</span>}
          </div>
          <div className="text-xs text-muted-foreground truncate mt-0.5">{th.last_message}</div>
        </Link>
      ))}
    </div>
  );
}

function ThreadView({ id }: { id: string }) {
  const qc = useQueryClient();
  const get = useServerFn(getRoommateThread);
  const send = useServerFn(sendRoommateMessage);
  const respond = useServerFn(respondRoommateRequest);
  const call = useServerFn(startRoommateCall);
  const [text, setText] = useState("");
  const [callUrl, setCallUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["rm-thread", id], queryFn: () => get({ data: { threadId: id } }), refetchInterval: 4000 });
  useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [data?.messages.length]);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["rm-thread", id] }); qc.invalidateQueries({ queryKey: ["rm-threads"] }); };
  const fail = (e: unknown) => setErr((e as Error).message || "Something went wrong");
  const sendM = useMutation({ mutationFn: (body: string) => send({ data: { threadId: id, body } }), onSuccess: () => { setText(""); setErr(""); refresh(); }, onError: fail });
  const respM = useMutation({ mutationFn: (decision: "accept" | "decline" | "block") => respond({ data: { threadId: id, decision } }), onSuccess: () => { setErr(""); refresh(); }, onError: fail });
  const callM = useMutation({ mutationFn: () => call({ data: { threadId: id } }), onSuccess: (r) => { setErr(""); setCallUrl(r.url); refresh(); }, onError: fail });

  if (isLoading) return <div className="py-16 grid place-items-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>;
  if (error || !data) return <div className="mt-6 text-sm text-destructive">{(error as Error)?.message ?? "Not found"}</div>;
  const active = data.status === "active";

  return (
    <div className="mt-4 rounded-2xl border border-border bg-card flex flex-col h-[70vh]">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div className="min-w-0">
          <Link to="/myr/roommate-chat" search={{ t: undefined }} className="text-xs text-muted-foreground hover:underline">All chats</Link>
          <div className="font-semibold truncate">{data.name}</div>
        </div>
        <div className="flex items-center gap-2">
          <button disabled={!active || callM.isPending} onClick={() => callM.mutate()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50">
            {callM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Video className="size-4" />} Video call
          </button>
          {data.status !== "blocked" && (
            <button disabled={respM.isPending} onClick={() => confirm("Block this person?") && respM.mutate("block")} title="Block"
              className="p-2 rounded-lg hover:bg-destructive/10 text-destructive disabled:opacity-50"><Ban className="size-4" /></button>
          )}
        </div>
      </div>

      {callUrl && (
        <div className="border-b border-border">
          <div className="flex items-center justify-between px-3 py-1.5 text-xs text-muted-foreground">
            <span>Video call (private room)</span>
            <button onClick={() => setCallUrl(null)} className="inline-flex items-center gap-1 hover:text-foreground"><X className="size-3" /> End</button>
          </div>
          <iframe title="Video call" src={callUrl} allow="camera; microphone; fullscreen; display-capture; autoplay" className="w-full h-72 bg-black" />
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {data.messages.map((m) => {
          const mine = m.sender_id === data.me;
          if (m.kind === "call")
            return (
              <div key={m.id} className="text-center">
                <button onClick={() => data.callUrl && setCallUrl(data.callUrl)} className="text-xs px-3 py-1.5 rounded-full bg-primary/10 text-primary inline-flex items-center gap-1.5">
                  <Video className="size-3.5" /> {mine ? "You started a video call" : `${data.name} started a video call`} — join
                </button>
              </div>
            );
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${mine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{m.body}</div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      {data.incoming && (
        <div className="px-4 py-3 border-t border-border flex items-center justify-between gap-2 bg-accent/40">
          <span className="text-sm">{data.name} aapse chat karna chahte hain.</span>
          <div className="flex gap-2">
            <button disabled={respM.isPending} onClick={() => respM.mutate("accept")} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"><Check className="size-4" /> Accept</button>
            <button disabled={respM.isPending} onClick={() => respM.mutate("decline")} className="px-3 py-1.5 rounded-lg border border-border text-sm disabled:opacity-50">Decline</button>
          </div>
        </div>
      )}
      {err && <div className="px-4 py-2 text-xs text-destructive border-t border-border">{err}</div>}
      {data.status === "pending" && !data.incoming && <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">Request bhej di gayi hai — accept hote hi chat khulegi.</div>}
      {data.status === "blocked" && <div className="px-4 py-2 text-xs text-muted-foreground border-t border-border">Yeh chat blocked hai.</div>}
      {active && (
        <form onSubmit={(e) => { e.preventDefault(); if (text.trim() && !sendM.isPending) sendM.mutate(text); }} className="p-3 border-t border-border flex gap-2">
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} placeholder="Message likhein…"
            className="flex-1 px-3 py-2 rounded-lg bg-background border border-input outline-none focus:ring-2 ring-ring/40 text-sm" />
          <button disabled={!text.trim() || sendM.isPending} className="px-3 rounded-lg bg-primary text-primary-foreground disabled:opacity-50" aria-label="Send">
            {sendM.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </button>
        </form>
      )}
    </div>
  );
}
