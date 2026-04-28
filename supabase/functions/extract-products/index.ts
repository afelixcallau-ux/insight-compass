// Extracts structured product data from raw Excel rows using Lovable AI + deterministic validation
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const fields = new Set(["name", "sku", "category", "price", "currency", "stock", "description", "url"]);
const aliases: Record<string, string[]> = {
  name: ["nombre", "producto", "product", "descripcion articulo", "articulo", "item", "titulo", "title", "denominacion"],
  sku: ["sku", "referencia", "ref", "codigo", "code", "id producto", "ean", "barcode", "gtin"],
  category: ["categoria", "category", "familia", "linea", "grupo", "seccion", "rubro"],
  price: ["precio", "price", "pvp", "importe", "venta", "coste", "amount", "tarifa", "precio final", "precio oferta"],
  currency: ["moneda", "currency", "divisa"],
  stock: ["stock", "existencias", "inventario", "unidades", "qty", "quantity", "cantidad"],
  description: ["descripcion", "description", "detalle", "observaciones", "notes"],
  url: ["url", "link", "enlace", "web", "pagina"],
};

const norm = (value: unknown) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  let s = String(value ?? "").trim();
  if (!s) return null;
  s = s.replace(/[^0-9,.-]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) s = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (lastComma > -1) s = s.replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  else s = s.replace(/,(?=\d{3}(\D|$))/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function detectMapping(rows: Record<string, unknown>[], aiMapping: Record<string, string>) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => !key.startsWith("__"))))];
  const mapping: Record<string, string> = {};
  for (const [left, right] of Object.entries(aiMapping || {})) {
    const l = String(left), r = String(right);
    if (columns.includes(l) && fields.has(r)) mapping[l] = r;
    else if (fields.has(l) && columns.includes(r)) mapping[r] = l;
  }
  const used = new Set(Object.values(mapping));
  for (const column of columns) {
    if (mapping[column]) continue;
    const key = norm(column);
    let best: string | null = null;
    let score = 0;
    for (const [field, words] of Object.entries(aliases)) {
      if (used.has(field)) continue;
      const hit = words.reduce((max, word) => key === norm(word) ? Math.max(max, 4) : key.includes(norm(word)) ? Math.max(max, 2) : max, 0);
      if (hit > score) { best = field; score = hit; }
    }
    if (best) { mapping[column] = best; used.add(best); }
  }
  return mapping;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { rows, filename } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("Missing LOVABLE_API_KEY");

    const cleanRows = Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") as Record<string, unknown>[] : [];
    if (cleanRows.length === 0) throw new Error("No se encontraron filas válidas");
    const sample = cleanRows.slice(0, 120);

    const system = `Eres un asistente que normaliza columnas de Excel de productos de tiendas/competidores.
Recibirás filas crudas (objetos con claves arbitrarias en cualquier idioma). Devuelve SIEMPRE JSON mediante la herramienta 'normalize'.
Tu tarea principal es detectar el mapeo exacto de columnas originales hacia: name, price, category, stock, sku, description, url, currency.
Si todas las filas parecen del mismo competidor y puedes inferir el nombre del archivo o datos, sugiere 'competitor_name'. Si no, null.
No inventes productos. No resumas. Los precios deben ser números sin símbolo y sin separadores de miles.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: `Archivo: ${filename}\nFilas (muestra ${sample.length} de ${cleanRows.length}):\n${JSON.stringify(sample)}` },
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

    // Apply AI mapping + deterministic aliases to all rows, not only the sample.
    const mapping = detectMapping(cleanRows, args.column_mapping || {});
    const normalizedAll = cleanRows.map((row: Record<string, unknown>) => {
      const out: Record<string, unknown> = {};
      for (const [orig, std] of Object.entries(mapping)) {
        if (row[orig] !== undefined) out[std] = row[orig];
      }
      out.raw = row;
      return out;
    }).filter((p) => p.name);

    // Coerce, validate and de-duplicate. This catches common AI mistakes and locale-specific prices.
    const seen = new Set<string>();
    const products = normalizedAll.map((p: Record<string, unknown>) => ({
      name: String(p.name ?? "").trim(),
      sku: p.sku ? String(p.sku).trim() : null,
      category: p.category ? String(p.category).trim() : null,
      price: parseNumber(p.price),
      currency: p.currency ? String(p.currency).trim().slice(0, 8) : "EUR",
      stock: parseNumber(p.stock) == null ? null : Math.round(parseNumber(p.stock)!),
      description: p.description ? String(p.description) : null,
      url: p.url ? String(p.url) : null,
      raw: p.raw,
    })).filter((p) => {
      if (!p.name || p.name.length < 2) return false;
      if (p.price != null && (p.price < 0 || p.price > 1000000)) p.price = null;
      const key = `${p.sku || ""}|${norm(p.name)}|${p.price ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return new Response(JSON.stringify({
      competitor_name: args.competitor_name,
      column_mapping: mapping,
      products,
      diagnostics: { rows_received: cleanRows.length, rows_imported: products.length, columns_detected: Object.keys(mapping).length },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
