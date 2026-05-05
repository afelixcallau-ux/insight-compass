// Proxy to Base44 agent messages API
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const BASE = "https://app.base44.com/api";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const apiKey = Deno.env.get("BASE44_API_KEY");
    const agentId = Deno.env.get("BASE44_AGENT_ID");
    if (!apiKey || !agentId) throw new Error("Missing BASE44_API_KEY / BASE44_AGENT_ID");

    const { conversationId, content, role } = await req.json();
    if (!conversationId || !content) throw new Error("conversationId y content requeridos");

    const target = `${BASE}/agents/${agentId}/conversations/${conversationId}/messages`;
    const r = await fetch(target, {
      method: "POST",
      headers: { "api_key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ role: role || "user", content }),
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
