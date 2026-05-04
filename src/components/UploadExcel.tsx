import { useState } from "react";
import * as XLSX from "xlsx";
import { FileSpreadsheet, FileText, Loader2, RefreshCw, Upload, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import type { Json, TablesInsert } from "@/integrations/supabase/types";

type ExtractedProduct = {
  name?: unknown;
  sku?: unknown;
  category?: unknown;
  price?: unknown;
  currency?: unknown;
  stock?: unknown;
  description?: unknown;
  url?: unknown;
  raw?: unknown;
};

type ProductInsert = TablesInsert<"products">;

type SheetRow = Array<unknown>;

const headerWords = [
  "name", "nombre", "producto", "product", "descripcion", "descripción", "articulo", "artículo", "item", "title", "titulo", "título",
  "sku", "ref", "referencia", "codigo", "código", "ean", "gtin", "categoria", "categoría", "familia", "precio", "price", "pvp", "importe", "stock", "cantidad", "unidades",
];

const cleanCell = (value: unknown) => {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim();
};

const uniqueHeader = (value: unknown, index: number, used: Set<string>) => {
  const base = cleanCell(value) || `col_${index + 1}`;
  let key = base;
  let n = 2;
  while (used.has(key)) key = `${base}_${n++}`;
  used.add(key);
  return key;
};

const rowDensity = (row: SheetRow) => row.filter((cell) => cleanCell(cell)).length;

const looksLikeHeader = (row: SheetRow, nextRows: SheetRow[]) => {
  const filled = rowDensity(row);
  if (filled < 2) return false;
  const cells = row.map(cleanCell).filter(Boolean);
  const textRatio = cells.filter((cell) => toNumberOrNull(cell) == null).length / Math.max(cells.length, 1);
  const keywordHits = cells.filter((cell) => headerWords.some((word) => cell.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(word.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))).length;
  const nextDensity = nextRows.slice(0, 5).filter((r) => rowDensity(r) >= Math.max(2, Math.min(filled, 3))).length;
  return keywordHits >= 1 || (textRatio > 0.75 && nextDensity >= 2 && filled >= 3);
};

const rowsFromSheetMatrix = (matrix: SheetRow[], sheetName: string) => {
  const output: Array<Record<string, unknown>> = [];
  let headers: string[] | null = null;

  matrix.forEach((row, index) => {
    if (rowDensity(row) === 0) return;
    if (looksLikeHeader(row, matrix.slice(index + 1, index + 7))) {
      const used = new Set<string>();
      headers = row.map((cell, idx) => uniqueHeader(cell, idx, used));
      return;
    }

    if (!headers) {
      if (rowDensity(row) >= 2) {
        const record: Record<string, unknown> = { __sheet: sheetName, __row: index + 1 };
        row.forEach((cell, idx) => record[`col_${idx + 1}`] = cleanCell(cell) || null);
        output.push(record);
      } else {
        const textLine = row.map(cleanCell).filter(Boolean).join(" ");
        if (textLine) output.push({ texto: textLine, __sheet: sheetName, __row: index + 1 });
      }
      return;
    }

    const record: Record<string, unknown> = { __sheet: sheetName, __row: index + 1 };
    headers.forEach((header, idx) => record[header] = cleanCell(row[idx]) || null);
    if (Object.entries(record).some(([key, value]) => !key.startsWith("__") && cleanCell(value))) output.push(record);
  });

  return output;
};

const toNullableString = (value: unknown) => {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
};

const toNumberOrNull = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value == null) return null;
  const text = String(value).replace(/[^0-9,.-]/g, "").trim();
  if (!text) return null;
  const decimal = text.lastIndexOf(",") > text.lastIndexOf(".") ? "," : ".";
  const normalized = decimal === "," ? text.replace(/\./g, "").replace(",", ".") : text.replace(/,/g, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
};

export function UploadExcel({ isMine, onDone }: { isMine: boolean; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"file" | "text">("file");
  const [text, setText] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [replaceExisting, setReplaceExisting] = useState(true);

  const importData = async (payload: { rows?: Array<Record<string, unknown>>; text?: string; filename: string }) => {
    setLoading(true);
    try {
      toast.info("Procesando datos con extracción híbrida...");
      const { data, error } = await supabase.functions.invoke("extract-products", {
        body: payload,
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;

      let competitorId: string | null = null;
      if (!isMine) {
        const cname = (data.competitor_name || payload.filename.replace(/\.[^.]+$/, "")).trim();
        const { data: existing } = await supabase.from("competitors").select("id").eq("name", cname).maybeSingle();
        if (existing) competitorId = existing.id;
        else {
          const { data: inserted, error: ce } = await supabase.from("competitors").insert({ user_id: userId, name: cname }).select("id").single();
          if (ce) throw ce;
          competitorId = inserted.id;
        }
      }

      const products: ProductInsert[] = ((data.products || []) as ExtractedProduct[])
        .map((p) => ({
          user_id: userId,
          competitor_id: competitorId,
          is_mine: isMine,
          name: String(p.name || "").trim(),
          sku: toNullableString(p.sku),
          category: toNullableString(p.category),
          price: toNumberOrNull(p.price),
          currency: toNullableString(p.currency) || "EUR",
          stock: toNumberOrNull(p.stock),
          description: toNullableString(p.description),
          url: toNullableString(p.url),
          raw: (p.raw ?? null) as Json | null,
        }))
        .filter((p) => p.name);

      if (products.length === 0) throw new Error("La IA no pudo extraer productos");

      if (replaceExisting) {
        const deleteQuery = supabase.from("products").delete();
        const { error: de } = isMine
          ? await deleteQuery.eq("is_mine", true)
          : competitorId
            ? await deleteQuery.eq("competitor_id", competitorId)
            : { error: null };
        if (de) throw de;
      }

      for (let i = 0; i < products.length; i += 200) {
        const chunk = products.slice(i, i + 200);
        const { error: ie } = await supabase.from("products").insert(chunk);
        if (ie) throw ie;
      }

      await supabase.from("uploads").insert({
        user_id: userId,
        filename: payload.filename,
        competitor_id: competitorId,
        is_mine: isMine,
        rows_imported: products.length,
      });

      toast.success(`${products.length} productos importados`);
      setText("");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  const handleFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const rows = wb.SheetNames.flatMap((sheetName) => {
      const sheet = wb.Sheets[sheetName];
      return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: false }).map((row, index) => ({
        ...row,
        __sheet: sheetName,
        __row: index + 2,
      }));
    }).filter((row) => Object.values(row).some((value) => value != null && String(value).trim() !== ""));
    if (rows.length === 0) throw new Error("El archivo está vacío");
    await importData({ rows, filename: file.name });
  };

  const handleText = async () => {
    const clean = text.trim();
    if (!clean) return toast.error("Pega datos antes de procesar");
    await importData({ text: clean, filename: sourceName.trim() || (isMine ? "Mis productos por texto" : "Competidor por texto") });
  };

  return (
    <div className="glass-strong rounded-2xl p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{isMine ? "Tus productos" : "Competidor"}</p>
          <p className="text-xs text-muted-foreground mt-1">Excel multihoja o texto pegado, sin plantilla fija</p>
        </div>
        {loading ? <Loader2 className="size-5 animate-spin text-primary" /> : <Wand2 className="size-5 text-secondary" />}
      </div>

      <div className="glass-subtle rounded-full p-1 grid grid-cols-2 gap-1">
        <Button type="button" variant={mode === "file" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setMode("file")} disabled={loading}>
          <FileSpreadsheet className="size-4 mr-1" /> Archivo
        </Button>
        <Button type="button" variant={mode === "text" ? "default" : "ghost"} size="sm" className="rounded-full" onClick={() => setMode("text")} disabled={loading}>
          <FileText className="size-4 mr-1" /> Texto
        </Button>
      </div>

      {mode === "file" ? (
        <label className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer border-2 border-dashed border-glass-border hover:border-primary transition-colors">
          <Upload className="size-6 text-primary" />
          <div className="text-center">
            <p className="text-sm font-medium">Selecciona Excel, CSV o XLS</p>
            <p className="text-xs text-muted-foreground mt-1">Lee todas las hojas y normaliza miles de filas</p>
          </div>
          <span className="inline-flex items-center rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground">Subir archivo</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="sr-only" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={loading} />
        </label>
      ) : (
        <div className="space-y-3">
          <Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder={isMine ? "Nombre del lote (opcional)" : "Nombre del competidor (opcional)"} className="rounded-xl bg-card/60 border-glass-border" disabled={loading} />
          <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Pega aquí tablas copiadas de Excel, CSV, listas de productos o texto largo con precios..." className="min-h-40 rounded-2xl bg-card/60 border-glass-border" disabled={loading} />
          <Button type="button" onClick={handleText} disabled={loading || !text.trim()} className="w-full rounded-full">
            {loading ? <Loader2 className="size-4 animate-spin mr-2" /> : <Wand2 className="size-4 mr-2" />}
            Procesar texto
          </Button>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={replaceExisting} onChange={(e) => setReplaceExisting(e.target.checked)} className="accent-primary" disabled={loading} />
        <RefreshCw className="size-3.5" /> Reemplazar datos anteriores de este origen
      </label>
    </div>
  );
}
