// Generates strategic analysis + recommendations from user's products
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { mine, competitors } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const system = `Eres un analista senior de pricing retail para Ha pampas market. Devuelve JSON con la herramienta 'analysis'.
Genera un resumen ejecutivo preciso, 4-7 insights accionables, 4-6 recomendaciones, riesgos de margen, oportunidades de subida/bajada de precio y patrones por categoría/competidor.
No inventes datos: si falta información dilo claramente. Sé directo, visual y en español.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `MIS PRODUCTOS (${mine.length}):\n${JSON.stringify(mine.slice(0, 500))}\n\nCOMPETIDORES (${competitors.length} productos):\n${JSON.stringify(competitors.slice(0, 1200))}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "analysis",
            parameters: {
              type: "object",
              properties: {
                summary: { type: "string" },
                insights: { type: "array", items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, severity: { type: "string", enum: ["info", "warn", "good"] } }, required: ["title", "detail", "severity"] } },
                recommendations: { type: "array", items: { type: "string" } },
              },
              required: ["summary", "insights", "recommendations"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "analysis" } },
      }),
    });

    if (!resp.ok) {
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Límite de uso alcanzado." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos agotados." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI error");
    }
    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : {};
    return new Response(JSON.stringify(args), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
