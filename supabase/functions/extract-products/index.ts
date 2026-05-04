// Hybrid extractor: deterministic header detection + AI fallback per chunk for messy data.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = Record<string, unknown>;

const STANDARD = ["name", "sku", "category", "price", "currency", "stock", "description", "url"] as const;
type Field = (typeof STANDARD)[number];

const aliases: Record<Field, string[]> = {
  name: ["name", "nombre", "producto", "product", "descripcion", "descripción", "articulo", "artículo", "item", "title", "titulo", "título", "denominacion", "denominación", "concepto"],
  sku: ["sku", "ref", "referencia", "codigo", "código", "code", "ean", "gtin", "id", "modelo", "barcode"],
  category: ["categoria", "categoría", "category", "familia", "seccion", "sección", "department", "rubro", "tipo", "linea", "línea", "grupo"],
  price: ["precio", "price", "pvp", "importe", "valor", "venta", "tarifa", "amount", "€", "eur", "precio venta", "p.v.p"],
  currency: ["moneda", "currency", "divisa"],
  stock: ["stock", "existencias", "inventario", "qty", "quantity", "cantidad", "unidades", "available", "disponible"],
  description: ["descripcion", "descripción", "description", "detalle", "details", "observaciones", "notas"],
  url: ["url", "link", "enlace", "web", "pagina", "página"],
};

const normKey = (v: string) => v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9€]+/g, " ").trim();

const cleanString = (v: unknown) => {
  if (v == null) return null;
  const t = String(v).replace(/\s+/g, " ").trim();
  return t && t !== "-" && t.toLowerCase() !== "null" ? t : null;
};

const badName = /^(pagina|página|page|total|subtotal|iva|vat|impuesto|precio|price|producto|product|ref|referencia|sku|codigo|código|stock|cantidad|unidades|fecha|cliente|proveedor)\b/i;

const numberValue = (v: unknown) => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const raw = cleanString(v);
  if (!raw) return null;
  const m = raw.match(/-?\d[\d.,\s]*/);
  if (!m) return null;
  let t = m[0].replace(/\s/g, "");
  const decimal = t.lastIndexOf(",") > t.lastIndexOf(".") ? "," : ".";
  t = decimal === "," ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

function priceFromLine(line: string) {
  const matches = [...line.matchAll(/(?:€|eur|usd|us\$|\$)?\s*-?\d{1,3}(?:[.\s]\d{3})*(?:[,.]\d{1,2})\s*(?:€|eur|usd|us\$|\$)?|-?\d+[,.]\d{2}/gi)]
    .map((match) => ({ text: match[0], index: match.index ?? 0, value: numberValue(match[0]) }))
    .filter((match) => match.value != null && match.value >= 0 && match.value < 1000000);
  if (!matches.length) return null;
  return matches[matches.length - 1];
}

function productFromTextLine(line: string, row: Row) {
  const clean = cleanString(line);
  if (!clean || clean.length < 4 || badName.test(clean)) return null;
  const price = priceFromLine(clean);
  if (!price) return null;
  let name = clean.slice(0, price.index).replace(/[|;,:\-–—]+$/g, "").trim();
  if (!name || name.length < 3) name = clean.replace(price.text, "").trim();
  const skuMatch = name.match(/^([A-Z0-9][A-Z0-9._\/-]{2,})\s+(.{3,})$/i);
  const sku = skuMatch ? skuMatch[1] : null;
  const afterPrice = clean.slice(price.index + price.text.length);
  const stockMatch = afterPrice.match(/\b(\d{1,6})\b/);
  if (skuMatch) name = skuMatch[2].trim();
  if (!name || badName.test(name) || name.split(" ").length > 24) return null;
  return {
    name: cleanString(name),
    sku,
    category: cleanString(row.__sheet),
    price: price.value,
    currency: /usd|us\$|\$/i.test(clean) ? "USD" : "EUR",
    stock: stockMatch ? numberValue(stockMatch[1]) : null,
    description: clean,
    url: null,
    raw: row,
  };
}

const inferCurrency = (row: Row) => {
  const t = Object.values(row).map((v) => String(v ?? "")).join(" ").toUpperCase();
  if (t.includes("USD") || t.includes("US$")) return "USD";
  if (t.includes("GBP") || t.includes("£")) return "GBP";
  return "EUR";
};

function scoreColumn(key: string, field: Field) {
  const k = normKey(key);
  return aliases[field].reduce((s, a) => {
    const aa = normKey(a);
    if (k === aa) return Math.max(s, 14);
    const tokens = k.split(" ");
    if (tokens.includes(aa)) return Math.max(s, 10);
    if (k.includes(aa)) return Math.max(s, 7);
    if (aa.includes(k) && k.length > 2) return Math.max(s, 4);
    return s;
  }, 0);
}

function inferMapping(rows: Row[]) {
  const sample = rows.slice(0, 400);
  const keys = Array.from(new Set(sample.flatMap((r) => Object.keys(r).filter((k) => !k.startsWith("__")))));
  const mapping: Record<string, Field> = {};
  const used = new Set<Field>();

  // Score every (key, field) pair, then take best matches greedily.
  const candidates: Array<{ key: string; field: Field; score: number }> = [];
  for (const field of STANDARD) {
    for (const key of keys) {
      let score = scoreColumn(key, field);
      const vals = sample.map((r) => r[key]).filter((v) => v != null && String(v).trim() !== "");
      if (vals.length === 0) continue;
      const numericRatio = vals.filter((v) => numberValue(v) != null).length / vals.length;
      const textRatio = vals.filter((v) => cleanString(v) && numberValue(v) == null).length / vals.length;
      if (field === "price") score += numericRatio * 6 + (numericRatio > 0.6 ? 3 : 0);
      if (field === "stock") score += numericRatio * 4;
      if (field === "name") score += textRatio * 4;
      if (field === "sku") score += vals.filter((v) => /^[A-Z0-9._-]{3,}$/i.test(String(v).trim())).length / vals.length * 4;
      if (score > 0) candidates.push({ key, field, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  for (const c of candidates) {
    if (used.has(c.field) || mapping[c.key]) continue;
    if (c.score < 5) continue;
    mapping[c.key] = c.field;
    used.add(c.field);
  }
  return mapping;
}

function normalizeRows(rows: Row[], mapping: Record<string, Field>) {
  return rows.map((row) => {
    if (typeof row.texto === "string") {
      const fromText = productFromTextLine(row.texto, row);
      if (fromText) return fromText;
      if (Object.keys(row).filter((key) => !key.startsWith("__")).length <= 1) return null;
    }

    const out: Partial<Record<Field, unknown>> = {};
    for (const [orig, std] of Object.entries(mapping)) out[std] = row[orig];

    if (!out.name) {
      const candidate = Object.entries(row).find(([k, v]) => !k.startsWith("__") && cleanString(v) && numberValue(v) == null && String(v).length > 2);
      if (candidate) out.name = candidate[1];
    }
    if (out.price == null) {
      const candidate = Object.entries(row).find(([k, v]) => !k.startsWith("__") && numberValue(v) != null && (scoreColumn(k, "price") > 0 || normKey(k).match(/precio|price|pvp|€|eur/)));
      if (candidate) out.price = candidate[1];
    }

    const product = {
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

    if ((!product.price || !product.name) && Object.keys(mapping).length < 2) {
      const joined = Object.entries(row).filter(([k]) => !k.startsWith("__")).map(([, v]) => cleanString(v)).filter(Boolean).join(" ");
      const fromText = productFromTextLine(joined, row);
      if (fromText) return { ...fromText, ...Object.fromEntries(Object.entries(product).filter(([, v]) => v != null)) };
    }

    return product;
  }).filter((p) => p?.name && p.name.length > 1 && !badName.test(String(p.name)));
}

function rowsFromText(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return lines.map((line, i) => ({ texto: line, __row: i + 1 }));
  const counts = { tab: lines[0].split("\t").length, semi: lines[0].split(";").length, comma: lines[0].split(",").length, pipe: lines[0].split("|").length };
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const delimMap: Record<string, string> = { tab: "\t", semi: ";", comma: ",", pipe: "|" };
  if (best[1] < 2) return lines.map((line, i) => ({ texto: line, __row: i + 1 }));
  const d = delimMap[best[0]];
  const headers = lines[0].split(d).map((h) => h.trim() || `col_${Math.random().toString(36).slice(2, 5)}`);
  return lines.slice(1).map((line, i) => {
    const cells = line.split(d);
    const row: Row = { __row: i + 2 };
    headers.forEach((h, idx) => row[h] = cells[idx]?.trim() ?? null);
    return row;
  });
}

async function aiNormalizeChunk(rows: Row[], filename: string, apiKey: string, attempt = 0): Promise<{ products: Row[]; competitor_name?: string | null }> {
  const system = `Eres un parser experto de catálogos retail para PAMPAS MARKET. Procesas Excel, CSV, PDF y texto copiado.
Devuelve SOLO la herramienta normalize. Extrae únicamente productos reales, no cabeceras, totales, páginas, impuestos ni textos legales.
Para cada producto devuelve name obligatorio, sku, category, price numérico, currency, stock numérico, description, url. Si falta algo usa null.
Si hay tablas sin cabecera, interpreta columnas por contexto. Si una línea tiene nombre + precio, úsala como producto. NO inventes datos.`;
  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Origen: ${filename}\nFilas/líneas a normalizar (JSON):\n${JSON.stringify(rows).slice(0, 100000)}` },
      ],
      tools: [{ type: "function", function: { name: "normalize", parameters: {
        type: "object",
        properties: {
          competitor_name: { type: ["string", "null"] },
          products: { type: "array", items: { type: "object", properties: {
            name: { type: "string" }, sku: { type: ["string", "null"] }, category: { type: ["string", "null"] },
            price: { type: ["number", "null"] }, currency: { type: ["string", "null"] }, stock: { type: ["number", "null"] },
            description: { type: ["string", "null"] }, url: { type: ["string", "null"] },
          }, required: ["name"] } },
        }, required: ["products"],
      } } }],
      tool_choice: { type: "function", function: { name: "normalize" } },
      temperature: 0,
    }),
  });
  if (resp.status === 429 && attempt < 2) {
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    return aiNormalizeChunk(rows, filename, apiKey, attempt + 1);
  }
  if (!resp.ok) {
    if (resp.status === 429) throw new Error("Límite de uso alcanzado, intenta en unos minutos.");
    if (resp.status === 402) throw new Error("Créditos de IA agotados.");
    throw new Error(`AI error ${resp.status}`);
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
    if (!LOVABLE_API_KEY) throw new Error("Falta LOVABLE_API_KEY");

    const rows: Row[] = Array.isArray(rawRows) ? rawRows : rowsFromText(String(text || ""));
    if (!rows.length) throw new Error("No hay datos para procesar");

    // 1) Deterministic pass
    const mapping = inferMapping(rows);
    const detected = Object.keys(mapping).length;
    let products = normalizeRows(rows, mapping);
    let competitor_name: string | null = null;

    // 2) AI fallback when deterministic mapping is poor or extraction yield is low
    const yield_ = products.length / Math.max(rows.length, 1);
    const needsAi = detected < 2 || yield_ < 0.5 || products.filter((p) => p.price != null).length / Math.max(products.length, 1) < 0.3;

    if (needsAi) {
      // Chunk rows and merge results. Deterministic pass handles very large files; AI repairs messy/PDF chunks.
      const chunkSize = 90;
      const maxChunks = 60;
      const aiProducts: Row[] = [];
      for (let i = 0; i < Math.min(rows.length, chunkSize * maxChunks); i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        try {
          const ai = await aiNormalizeChunk(chunk, filename, LOVABLE_API_KEY);
          if (!competitor_name && ai.competitor_name) competitor_name = ai.competitor_name;
          if (Array.isArray(ai.products)) {
            for (const p of ai.products) {
              if (p.name && !badName.test(String(p.name))) aiProducts.push({ ...p, raw: p.raw ?? chunk[aiProducts.length % chunk.length] ?? null });
            }
          }
        } catch (e) {
          console.error("chunk error", i, e);
          if (i === 0) throw e;
          break;
        }
      }
      const deterministicPriceRatio = products.filter((p) => p.price != null).length / Math.max(products.length, 1);
      const deterministicQuality = products.length / Math.max(rows.length, 1) > 0.25 && deterministicPriceRatio > 0.7;
      if ((!deterministicQuality && aiProducts.length > products.length * 0.8) || aiProducts.length > products.length * 1.25) {
        products = aiProducts.map((p) => ({
          name: cleanString(p.name),
          sku: cleanString(p.sku),
          category: cleanString(p.category),
          price: typeof p.price === "number" ? p.price : numberValue(p.price),
          currency: cleanString(p.currency) || "EUR",
          stock: typeof p.stock === "number" ? p.stock : numberValue(p.stock),
          description: cleanString(p.description),
          url: cleanString(p.url),
          raw: p.raw ?? null,
        })).filter((p) => p.name);
      }
    }

    return new Response(JSON.stringify({
      competitor_name,
      column_mapping: mapping,
      products: products.slice(0, 20000),
      stats: {
        rows_received: rows.length,
        rows_extracted: products.length,
        used_ai: needsAi,
        columns_detected: detected,
      },
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
