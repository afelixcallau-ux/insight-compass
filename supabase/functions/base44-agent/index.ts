// Proxy to Base44 agent API
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
    const action = url.searchParams.get("action") || "";
    const conversationId = url.searchParams.get("conversationId") || "";

    let target = "";
    let method = req.method;
    let body: string | undefined;

    if (action === "agent") { target = `${BASE}/agents/${agentId}`; method = "GET"; }
    else if (action === "conversations" && method === "GET") target = `${BASE}/agents/${agentId}/conversations`;
    else if (action === "conversations" && method === "POST") { target = `${BASE}/agents/${agentId}/conversations`; body = await req.text() || "{}"; }
    else if (action === "messages" && method === "GET") target = `${BASE}/agents/${agentId}/conversations/${conversationId}/messages`;
    else if (action === "messages" && method === "POST") { target = `${BASE}/agents/${agentId}/conversations/${conversationId}/messages`; body = await req.text(); }
    else if (action === "delete-conversation") { target = `${BASE}/agents/${agentId}/conversations/${conversationId}`; method = "DELETE"; }
    else throw new Error("Invalid action");

    const r = await fetch(target, {
      method,
      headers: { "api_key": apiKey, "Content-Type": "application/json" },
      body,
    });
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
