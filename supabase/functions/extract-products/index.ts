// Extracts structured product data from raw Excel rows using Lovable AI
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { rows, filename } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const sample = rows.slice(0, 60);

    const system = `Eres un asistente que normaliza filas de Excel de productos de tiendas/competidores.
Recibirás filas crudas (objetos con claves arbitrarias en cualquier idioma). Devuelve SIEMPRE JSON mediante la herramienta 'normalize'.
Detecta la columna que representa nombre, precio, categoría, stock, sku, descripción, url. Si no existe, usa null.
Si todas las filas parecen del mismo competidor y puedes inferir el nombre del archivo o datos, sugiere 'competitor_name'. Si no, null.
Los precios deben ser números (sin símbolo).`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Archivo: ${filename}\nFilas (muestra ${sample.length} de ${rows.length}):\n${JSON.stringify(sample)}` },
        ],
        tools: [{
          type: "function",
          function: {
            name: "normalize",
            description: "Normaliza filas a productos estructurados",
            parameters: {
              type: "object",
              properties: {
                competitor_name: { type: ["string", "null"] },
                column_mapping: {
                  type: "object",
                  description: "Mapeo columna original -> campo estándar",
                  additionalProperties: { type: "string" },
                },
                products: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      sku: { type: ["string", "null"] },
                      category: { type: ["string", "null"] },
                      price: { type: ["number", "null"] },
                      currency: { type: ["string", "null"] },
                      stock: { type: ["integer", "null"] },
                      description: { type: ["string", "null"] },
                      url: { type: ["string", "null"] },
                    },
                    required: ["name"],
                  },
                },
              },
              required: ["products", "column_mapping"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "normalize" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI error", resp.status, t);
      if (resp.status === 429) return new Response(JSON.stringify({ error: "Límite de uso alcanzado, intenta más tarde." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (resp.status === 402) return new Response(JSON.stringify({ error: "Créditos de IA agotados. Añade fondos en tu workspace." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error("AI gateway error");
    }

    const data = await resp.json();
    const call = data.choices?.[0]?.message?.tool_calls?.[0];
    const args = call ? JSON.parse(call.function.arguments) : { products: [], column_mapping: {} };

    // Apply mapping to all rows (not just sample) using the mapping returned
    const mapping: Record<string, string> = args.column_mapping || {};
    const normalizedAll = rows.map((row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [orig, std] of Object.entries(mapping)) {
        if (row[orig] !== undefined) out[std] = row[orig];
      }
      return out;
    }).filter((p) => p.name);

    // Coerce types
    const products = normalizedAll.map((p: Record<string, unknown>) => ({
      name: String(p.name ?? "").trim(),
      sku: p.sku ? String(p.sku) : null,
      category: p.category ? String(p.category) : null,
      price: p.price !== undefined && p.price !== null && p.price !== "" ? Number(String(p.price).replace(/[^0-9.,-]/g, "").replace(",", ".")) || null : null,
      currency: p.currency ? String(p.currency) : "EUR",
      stock: p.stock !== undefined && p.stock !== null && p.stock !== "" ? parseInt(String(p.stock)) || null : null,
      description: p.description ? String(p.description) : null,
      url: p.url ? String(p.url) : null,
    })).filter((p) => p.name);

    return new Response(JSON.stringify({
      competitor_name: args.competitor_name,
      column_mapping: mapping,
      products: products.length > 0 ? products : args.products,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
