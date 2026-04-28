import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Send, Sparkles, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";

export const Route = createFileRoute("/app/chat")({ component: ChatPage });

type Msg = { role: "user" | "assistant"; content: string };

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9e9, behavior: "smooth" }); }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg: Msg = { role: "user", content: text };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);

    try {
      // Load context
      const [{ data: products }, { data: competitors }] = await Promise.all([
        supabase.from("products").select("name,price,category,is_mine,competitor_id").limit(300),
        supabase.from("competitors").select("id,name"),
      ]);

      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/chat`;
      const resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: JSON.stringify({
          messages: [...messages, userMsg],
          context: { products: products || [], competitors: competitors || [] },
        }),
      });

      if (!resp.ok || !resp.body) {
        if (resp.status === 429) toast.error("Límite de uso alcanzado");
        else if (resp.status === 402) toast.error("Créditos agotados");
        else toast.error("Error");
        setLoading(false);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = "", acc = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) !== -1) {
          let line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const j = line.slice(6).trim();
          if (j === "[DONE]") { buf = ""; break; }
          try {
            const p = JSON.parse(j);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              acc += c;
              setMessages((m) => m.map((msg, i) => i === m.length - 1 ? { ...msg, content: acc } : msg));
            }
          } catch { buf = line + "\n" + buf; break; }
        }
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] md:h-[calc(100vh-6rem)]">
      <div className="mb-4">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Chat con IA</h1>
        <p className="text-muted-foreground mt-1">Pregúntale a tus datos</p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-auto glass rounded-2xl p-4 space-y-4">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-10">
            <div className="size-12 rounded-2xl bg-gradient-to-br from-primary to-chart-3 flex items-center justify-center">
              <Sparkles className="size-6 text-primary-foreground" />
            </div>
            <p className="text-muted-foreground max-w-sm">Ej: "¿Quién tiene los precios más bajos en mi categoría top?"</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-primary text-primary-foreground" : "glass-subtle"}`}>
              {m.role === "assistant" ? (
                <div className="prose prose-sm max-w-none text-foreground/90">
                  <ReactMarkdown>{m.content || "…"}</ReactMarkdown>
                </div>
              ) : <div className="text-sm whitespace-pre-wrap">{m.content}</div>}
            </div>
          </div>
        ))}
        {loading && messages[messages.length - 1]?.role === "user" && (
          <div className="flex justify-start"><div className="glass-subtle rounded-2xl px-4 py-2.5"><Loader2 className="size-4 animate-spin" /></div></div>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <Input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} placeholder="Escribe tu pregunta..." className="rounded-full bg-glass border-border" disabled={loading} />
        <Button onClick={send} disabled={loading || !input.trim()} size="icon" className="rounded-full size-10"><Send className="size-4" /></Button>
      </div>
    </div>
  );
}
