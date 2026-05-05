// Full proxy to Base44 agent API — supports conversations, messages, memory
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

const BASE = "https://app.base44.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BASE44_API_KEY");
    const agentId = Deno.env.get("BASE44_AGENT_ID");
    if (!apiKey || !agentId) throw new Error("Missing BASE44_API_KEY / BASE44_AGENT_ID");

    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "message";

    let target = "";
    let method = req.method;
    let body: string | null = null;

    if (action === "list-conversations") {
      target = `${BASE}/agents/${agentId}/conversations`;
      method = "GET";
    } else if (action === "create-conversation") {
      target = `${BASE}/agents/${agentId}/conversations`;
      method = "POST";
      body = await req.text();
    } else if (action === "get-conversation") {
      const convId = url.searchParams.get("conversationId");
      if (!convId) throw new Error("conversationId required");
      target = `${BASE}/agents/${agentId}/conversations/${convId}`;
      method = "GET";
    } else if (action === "delete-message") {
      const convId = url.searchParams.get("conversationId");
      const msgId = url.searchParams.get("messageId");
      if (!convId || !msgId) throw new Error("conversationId and messageId required");
      target = `${BASE}/agents/${agentId}/conversations/${convId}/messages/${msgId}`;
      method = "DELETE";
    } else if (action === "memory") {
      target = `${BASE}/agents/${agentId}/memory`;
      method = "GET";
    } else if (action === "delete-memory") {
      const memId = url.searchParams.get("memoryId");
      if (!memId) throw new Error("memoryId required");
      target = `${BASE}/agents/${agentId}/memory/${memId}`;
      method = "DELETE";
    } else {
      // default: send message
      const { conversationId, content, role } = await req.json();
      if (!conversationId || !content) throw new Error("conversationId y content requeridos");
      target = `${BASE}/agents/${agentId}/conversations/${conversationId}/messages`;
      method = "POST";
      body = JSON.stringify({ role: role || "user", content });
    }

    const headers: Record<string, string> = { "api_key": apiKey, "Content-Type": "application/json" };
    const fetchOpts: RequestInit = { method, headers };
    if (body && (method === "POST" || method === "PUT")) fetchOpts.body = body;

    const r = await fetch(target, fetchOpts);
    const text = await r.text();
    return new Response(text, {
      status: r.status,
      headers: { ...corsHeaders, "Content-Type": r.headers.get("Content-Type") || "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
