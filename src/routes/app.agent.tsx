import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Bot, Send, Loader2, Plus, Trash2, Sparkles, Settings } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/agent")({ component: AgentPage });

type Message = { role: "user" | "assistant"; content: string; ts: number };
type Conv = { id: string; title: string; messages: Message[]; updated: number };

const FN = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/base44-agent`;
const AUTH = { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` };
const STORE_KEY = "pampas_agent_convs_v1";
const DEFAULT_CONV_ID = "69f1bc13777455158dd6a954";

function loadConvs(): Conv[] {
  try { return JSON.parse(localStorage.getItem(STORE_KEY) || "[]"); } catch { return []; }
}
function saveConvs(c: Conv[]) { localStorage.setItem(STORE_KEY, JSON.stringify(c)); }

function AgentPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [convInput, setConvInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = loadConvs();
    if (list.length === 0) {
      const d: Conv = { id: DEFAULT_CONV_ID, title: "Conversación principal", messages: [], updated: Date.now() };
      setConvs([d]); setActiveId(d.id); saveConvs([d]);
    } else {
      setConvs(list); setActiveId(list[0].id);
    }
  }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [activeId, convs]);

  const active = convs.find((c) => c.id === activeId);

  const update = (id: string, mut: (c: Conv) => Conv) => {
    setConvs((cs) => {
      const next = cs.map((c) => c.id === id ? mut(c) : c);
      saveConvs(next); return next;
    });
  };

  const newConv = () => {
    const id = prompt("ID de conversación de Base44:", "");
    if (!id) return;
    const title = prompt("Nombre de esta conversación:", `Chat ${convs.length + 1}`) || "Chat";
    const c: Conv = { id: id.trim(), title, messages: [], updated: Date.now() };
    const next = [c, ...convs]; setConvs(next); saveConvs(next); setActiveId(c.id);
  };

  const deleteConv = (id: string) => {
    if (!confirm("¿Eliminar esta conversación local? (no afecta a Base44)")) return;
    const next = convs.filter((c) => c.id !== id); setConvs(next); saveConvs(next);
    if (activeId === id) setActiveId(next[0]?.id || null);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || sending || !active) return;
    setInput("");
    update(active.id, (c) => ({ ...c, messages: [...c.messages, { role: "user", content: text, ts: Date.now() }], updated: Date.now() }));
    setSending(true);
    try {
      const r = await fetch(FN, {
        method: "POST",
        headers: { ...AUTH, "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: active.id, role: "user", content: text }),
      });
      const txt = await r.text();
      let data: any = {};
      try { data = txt ? JSON.parse(txt) : {}; } catch { data = { content: txt }; }
      if (!r.ok) throw new Error(data.error || data.detail || data.message || `HTTP ${r.status}`);
      const reply = data.content || data.message?.content || data.assistant?.content || data.response || data.reply || JSON.stringify(data);
      update(active.id, (c) => ({ ...c, messages: [...c.messages, { role: "assistant", content: reply, ts: Date.now() }], updated: Date.now() }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally { setSending(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center"><Bot className="size-5 text-primary" /></div>
            <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Agente IA</h1>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">Conectado a Base44 / OpenClaw</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowSettings(!showSettings)}><Settings className="size-4" /></Button>
          <Button size="sm" onClick={newConv}><Plus className="size-4" /> Nueva</Button>
        </div>
      </div>

      {showSettings && active && (
        <div className="glass rounded-2xl p-4 space-y-2">
          <div className="text-sm font-medium">Conversación activa</div>
          <Input value={convInput || active.id} onChange={(e) => setConvInput(e.target.value)} placeholder="ID conversación" />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { if (convInput.trim()) { update(active.id, (c) => ({ ...c, id: convInput.trim() })); setActiveId(convInput.trim()); setConvInput(""); toast.success("ID actualizado"); } }}>Guardar ID</Button>
            <Button size="sm" variant="outline" onClick={() => setShowSettings(false)}>Cerrar</Button>
          </div>
          <p className="text-xs text-muted-foreground">Crea conversaciones en Base44 y pega su ID aquí para chatear con ellas.</p>
        </div>
      )}

      <div className="grid md:grid-cols-[260px_1fr] gap-4 h-[calc(100vh-14rem)]">
        <div className="glass rounded-2xl p-2 overflow-auto">
          {convs.map((c) => (
            <div key={c.id} className={`group flex items-center gap-1 rounded-xl px-2 py-2 mb-1 cursor-pointer transition-all ${activeId === c.id ? "bg-primary/10" : "hover:bg-card/60"}`} onClick={() => setActiveId(c.id)}>
              <div className="flex-1 min-w-0">
                <div className="text-sm truncate">{c.title}</div>
                <div className="text-[10px] text-muted-foreground truncate">{c.id.slice(0, 12)}…</div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); deleteConv(c.id); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>

        <div className="flex flex-col glass rounded-2xl overflow-hidden">
          <div ref={scrollRef} className="flex-1 overflow-auto p-4 space-y-3">
            {(!active || active.messages.length === 0) && (
              <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
                <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center"><Sparkles className="size-6 text-primary" /></div>
                <p className="text-muted-foreground max-w-sm text-sm">Habla con tu agente Base44. Pídele que ejecute automatizaciones, analice competidores o resuma datos.</p>
              </div>
            )}
            {active?.messages.map((m, i) => (
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
            <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Mensaje al agente..." disabled={sending || !active} className="rounded-full bg-card/60" />
            <Button onClick={send} disabled={sending || !input.trim() || !active} size="icon" className="rounded-full size-10"><Send className="size-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}
