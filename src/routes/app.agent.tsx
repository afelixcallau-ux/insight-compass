import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2, Plus, Trash2, RefreshCw, Sparkles } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/agent")({ component: AgentPage });

type Conversation = { id: string; title?: string; created_date?: string; updated_date?: string };
type Message = { id?: string; role: "user" | "assistant" | "system"; content: string; created_date?: string };

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/base44-agent`;
const AUTH = { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };

async function api(action: string, opts: { method?: string; conversationId?: string; body?: any } = {}) {
  const params = new URLSearchParams({ action });
  if (opts.conversationId) params.set("conversationId", opts.conversationId);
  const r = await fetch(`${FN}?${params}`, {
    method: opts.method || "GET",
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const txt = await r.text();
  let data: any = {};
  try { data = txt ? JSON.parse(txt) : {}; } catch { data = { raw: txt }; }
  if (!r.ok) throw new Error(data.error || data.detail || `HTTP ${r.status}`);
  return data;
}

function AgentPage() {
  const [agentInfo, setAgentInfo] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [messages]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [info, convRes] = await Promise.all([
        api("agent").catch(() => null),
        api("conversations").catch(() => ({ data: [] })),
      ]);
      setAgentInfo(info);
      const list = Array.isArray(convRes) ? convRes : (convRes.data || convRes.conversations || []);
      setConversations(list);
      if (list.length && !activeId) selectConv(list[0].id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error cargando agente");
    } finally { setLoading(false); }
  };

  const selectConv = async (id: string) => {
    setActiveId(id);
    setMessages([]);
    try {
      const res = await api("messages", { conversationId: id });
      const msgs = Array.isArray(res) ? res : (res.data || res.messages || []);
      setMessages(msgs);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  const newConv = async () => {
    try {
      const res = await api("conversations", { method: "POST", body: { title: `Chat ${new Date().toLocaleString("es")}` } });
      const id = res.id || res._id || res.data?.id;
      if (id) {
        setConversations((c) => [{ id, title: res.title }, ...c]);
        setActiveId(id);
        setMessages([]);
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  const deleteConv = async (id: string) => {
    if (!confirm("¿Eliminar esta conversación?")) return;
    try {
      await api("delete-conversation", { method: "DELETE", conversationId: id });
      setConversations((c) => c.filter((x) => x.id !== id));
      if (activeId === id) { setActiveId(null); setMessages([]); }
    } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    let convId = activeId;
    if (!convId) {
      try {
        const res = await api("conversations", { method: "POST", body: { title: text.slice(0, 40) } });
        convId = res.id || res._id || res.data?.id;
        if (convId) { setConversations((c) => [{ id: convId!, title: text.slice(0, 40) }, ...c]); setActiveId(convId); }
      } catch (e) { toast.error(e instanceof Error ? e.message : "Error"); return; }
    }
    if (!convId) return;

    setInput("");
    setMessages((m) => [...m, { role: "user", content: text }]);
    setSending(true);
    try {
      const res = await api("messages", { method: "POST", conversationId: convId, body: { role: "user", content: text } });
      // Try to extract assistant response
      const reply = res.content || res.message?.content || res.assistant?.content || res.data?.content;
      if (reply) {
        setMessages((m) => [...m, { role: "assistant", content: reply }]);
      } else {
        // Reload messages
        const msgsRes = await api("messages", { conversationId: convId });
        const msgs = Array.isArray(msgsRes) ? msgsRes : (msgsRes.data || msgsRes.messages || []);
        setMessages(msgs);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
      setMessages((m) => m.slice(0, -1));
      setInput(text);
    } finally { setSending(false); }
  };

  useEffect(() => { loadAll(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center"><Bot className="size-5 text-primary" /></div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Agente IA</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            {agentInfo?.name ? <>Conectado a <strong>{agentInfo.name}</strong> · Base44</> : "Tu agente Base44 / OpenClaw"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadAll} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} /> Actualizar
          </Button>
          <Button size="sm" onClick={newConv}><Plus className="size-4" /> Nueva</Button>
        </div>
      </div>

      <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-14rem)]">
        {/* Conversations list */}
        <div className="glass rounded-2xl p-2 overflow-auto">
          {conversations.length === 0 && !loading && (
            <div className="text-center text-sm text-muted-foreground p-6">Sin conversaciones</div>
          )}
          {conversations.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-xl px-2 py-2 mb-1 cursor-pointer transition-all ${activeId === c.id ? "bg-primary/10" : "hover:bg-card/60"}`} onClick={() => selectConv(c.id)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{c.title || "Conversación"}</div>
                {c.updated_date && <div className="text-[10px] text-muted-foreground">{new Date(c.updated_date).toLocaleDateString("es")}</div>}
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Chat */}
        <div className="flex flex-col glass rounded-2xl overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
            {messages.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Sparkles className="size-6 text-primary" /></div>
                <p className="text-muted-foreground max-w-sm text-sm">Habla con tu agente. Pídele que ejecute automatizaciones, analice competidores o resuma datos.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-primary text-primary-foreground" : "glass-subtle"}`}>
                  {m.role === "assistant" ? (
                    <div className="prose prose-sm max-w-none text-foreground/90"><ReactMarkdown>{m.content || "…"}</ReactMarkdown></div>
                  ) : <div className="text-sm whitespace-pre-wrap">{m.content}</div>}
                </div>
              </div>
            ))}
            {sending && <div className="flex justify-start"><div className="glass-subtle rounded-2xl px-4 py-2.5"><Loader2 className="size-4 animate-spin" /></div></div>}
          </div>
          <div className="p-3 border-t border-border/40 flex gap-2">
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Mensaje al agente..." disabled={sending} className="rounded-full bg-card/60" />
            <Button onClick={send} disabled={sending || !input.trim()} size="icon" className="rounded-full size-10"><Send className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
