// Hybrid extractor for large Excel files and pasted text.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, unknown>;

const STANDARD = ["name", "sku", "category", "price", "currency", "stock", "description", "url"] as const;
const aliases: Record<(typeof STANDARD)[number], string[]> = {
  name: ["name", "nombre", "producto", "product", "descripcion", "descripción", "articulo", "artículo", "item", "title", "titulo", "título", "denominacion", "denominación"],
  sku: ["sku", "ref", "referencia", "codigo", "código", "code", "ean", "gtin", "id", "modelo"],
  category: ["categoria", "categoría", "category", "familia", "seccion", "sección", "department", "rubro", "tipo", "linea", "línea"],
  price: ["precio", "price", "pvp", "importe", "valor", "venta", "tarifa", "coste", "costo", "amount", "€", "eur"],
  currency: ["moneda", "currency", "divisa"],
  stock: ["stock", "existencias", "inventario", "qty", "quantity", "cantidad", "unidades", "available", "disponible"],
  description: ["descripcion", "descripción", "description", "detalle", "details", "observaciones", "notas"],
  url: ["url", "link", "enlace", "web", "pagina", "página"],
};

function normKey(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9€]+/g, " ").trim();
}

function cleanString(value: unknown) {
  if (value == null) return null;
  const text = String(value).replace(/\s+/g, " ").trim();
  return text && text !== "-" ? text : null;
}

function numberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = cleanString(value);
  if (!raw) return null;
  const match = raw.match(/-?\d[\d.,]*/);
  if (!match) return null;
  const text = match[0];
  const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
  const normalized = decimal === "," ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function inferCurrency(row: Row) {
  const text = Object.values(row).map((v) => String(v ?? "")).join(" ").toUpperCase();
  if (text.includes("USD") || text.includes("$") || text.includes("US$")) return "USD";
  if (text.includes("GBP") || text.includes("£")) return "GBP";
  if (text.includes("€") || text.includes("EUR")) return "EUR";
  return "EUR";
}

function scoreColumn(key: string, field: keyof typeof aliases) {
  const k = normKey(key);
  return aliases[field].reduce((score, alias) => {
    const a = normKey(alias);
    if (k === a) return Math.max(score, 12);
    if (k.includes(a)) return Math.max(score, 7);
    if (a.includes(k) && k.length > 2) return Math.max(score, 4);
    return score;
  }, 0);
}

function inferMapping(rows: Row[]) {
  const keys = Array.from(new Set(rows.slice(0, 250).flatMap((row) => Object.keys(row).filter((k) => !k.startsWith("__")))));
  const mapping: Record<string, string> = {};
  for (const field of STANDARD) {
    let best = "";
    let bestScore = 0;
    for (const key of keys) {
      let score = scoreColumn(key, field);
      const vals = rows.slice(0, 120).map((r) => r[key]).filter((v) => v != null && String(v).trim() !== "");
      if (field === "price") score += vals.filter((v) => numberValue(v) != null).length / Math.max(vals.length || 1, 1) * 5;
      if (field === "name") score += vals.filter((v) => cleanString(v) && numberValue(v) == null).length / Math.max(vals.length || 1, 1) * 3;
      if (score > bestScore) { best = key; bestScore = score; }
    }
    if (best && bestScore >= 4 && !Object.values(mapping).includes(field)) mapping[best] = field;
  }
  return mapping;
}

function normalizeRows(rows: Row[], mapping: Record<string, string>) {
  return rows.map((row) => {
    const out: Row = { raw: row };
    for (const [orig, std] of Object.entries(mapping)) out[std] = row[orig];
    const vals = Object.entries(row).filter(([k, v]) => !k.startsWith("__") && cleanString(v));
    if (!out.name) out.name = vals.find(([, v]) => cleanString(v) && numberValue(v) == null)?.[1];
    if (!out.price) out.price = vals.find(([k, v]) => scoreColumn(k, "price") > 0 || numberValue(v) != null)?.[1];
    return {
      name: cleanString(out.name),
      sku: cleanString(out.sku),
      category: cleanString(out.category),
      price: numberValue(out.price),
      currency: cleanString(out.currency) || inferCurrency(row),
      stock: numberValue(out.stock),
      description: cleanString(out.description),
      url: cleanString(out.url),
      raw: row,
    };
  }).filter((p) => p.name && (p.price != null || p.sku || p.category));
}

function rowsFromText(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const delimiter = text.includes("\t") ? "\t" : text.includes(";") ? ";" : text.includes(",") ? "," : null;
  if (delimiter && lines.length > 1) {
    const headers = lines[0].split(delimiter).map((h) => h.trim());
    return lines.slice(1).map((line, i) => Object.fromEntries(line.split(delimiter).map((cell, idx) => [headers[idx] || `col_${idx + 1}`, cell.trim()]).concat([["__row", i + 2]])));
  }
  return lines.map((line, i) => ({ texto: line, __row: i + 1 }));
}

async function refineTextWithAi(text: string, filename: string, apiKey: string) {
  const system = `Extrae productos desde texto libre o tablas pegadas. Devuelve solo la herramienta normalize. No inventes datos: si no está claro, usa null. Precios como número.`;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Origen: ${filename}\nTexto:\n${text.slice(0, 45000)}` },
      ],
      tools: [{ type: "function", function: { name: "normalize", parameters: { type: "object", properties: { competitor_name: { type: ["string", "null"] }, products: { type: "array", items: { type: "object", properties: { name: { type: "string" }, sku: { type: ["string", "null"] }, category: { type: ["string", "null"] }, price: { type: ["number", "null"] }, currency: { type: ["string", "null"] }, stock: { type: ["number", "null"] }, description: { type: ["string", "null"] }, url: { type: ["string", "null"] } }, required: ["name"] } } }, required: ["products"] } } }],
      tool_choice: { type: "function", function: { name: "normalize" } },
      temperature: 0.1,
    }),
  });
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Límite de uso alcanzado, intenta más tarde.");
    if (resp.status === 402) throw new Error("Créditos de IA agotados. Añade fondos en tu workspace.");
    throw new Error("AI gateway error");
  }
  const data = await resp.json();
  const call = data.choices?.[0]?.message?.tool_calls?.[0];
  return call ? JSON.parse(call.function.arguments) : { products: [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { rows: rawRows, text, filename = "datos" } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const rows: Row[] = Array.isArray(rawRows) ? rawRows : rowsFromText(String(text || ""));
    if (!rows.length) throw new Error("No hay datos para procesar");

    const mapping = inferMapping(rows);
    let products = normalizeRows(rows, mapping);
    let competitor_name: string | null = null;

    if ((text || products.length === 0) && LOVABLE_API_KEY) {
      const ai = await refineTextWithAi(String(text || JSON.stringify(rows.slice(0, 2000))), filename, LOVABLE_API_KEY);
      competitor_name = ai.competitor_name || null;
      if (Array.isArray(ai.products) && ai.products.length > products.length) products = ai.products;
    }

    return new Response(JSON.stringify({
      competitor_name,
      column_mapping: mapping,
      products: products.slice(0, 20000),
      stats: { rows_received: rows.length, rows_extracted: products.length, extraction: text ? "text-ai" : "deterministic-multi-sheet" },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});