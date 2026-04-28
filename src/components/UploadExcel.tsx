import { useState } from "react";
import * as XLSX from "xlsx";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function UploadExcel({ isMine, onDone }: { isMine: boolean; onDone: () => void }) {
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File) => {
    setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      if (rows.length === 0) throw new Error("El Excel está vacío");

      toast.info("La IA está analizando el archivo...");
      const { data, error } = await supabase.functions.invoke("extract-products", {
        body: { rows, filename: file.name },
      });
      if (error) throw error;
      if (data.error) throw new Error(data.error);

      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user!.id;

      let competitorId: string | null = null;
      if (!isMine) {
        const cname = (data.competitor_name || file.name.replace(/\.[^.]+$/, "")).trim();
        const { data: existing } = await supabase.from("competitors").select("id").eq("name", cname).maybeSingle();
        if (existing) competitorId = existing.id;
        else {
          const { data: inserted, error: ce } = await supabase.from("competitors").insert({ user_id: userId, name: cname }).select("id").single();
          if (ce) throw ce;
          competitorId = inserted.id;
        }
      }

      const products = (data.products as Array<Record<string, unknown>>).map((p) => ({
        user_id: userId,
        competitor_id: competitorId,
        is_mine: isMine,
        name: p.name,
        sku: p.sku,
        category: p.category,
        price: p.price,
        currency: p.currency || "EUR",
        stock: p.stock,
        description: p.description,
        url: p.url,
      }));

      if (products.length === 0) throw new Error("La IA no pudo extraer productos");

      // Insert in chunks
      for (let i = 0; i < products.length; i += 200) {
        const chunk = products.slice(i, i + 200);
        const { error: ie } = await supabase.from("products").insert(chunk);
        if (ie) throw ie;
      }

      await supabase.from("uploads").insert({
        user_id: userId,
        filename: file.name,
        competitor_id: competitorId,
        is_mine: isMine,
        rows_imported: products.length,
      });

      toast.success(`${products.length} productos importados`);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <label className="glass rounded-2xl p-6 flex flex-col items-center justify-center gap-3 cursor-pointer border-dashed border-2 border-primary/20 hover:border-primary/40 transition-colors">
      {loading ? <Loader2 className="size-6 animate-spin text-primary" /> : <Upload className="size-6 text-primary" />}
      <div className="text-center">
        <p className="text-sm font-medium">{isMine ? "Sube tus productos" : "Sube Excel de competidor"}</p>
        <p className="text-xs text-muted-foreground mt-1">La IA detectará las columnas automáticamente</p>
      </div>
      <Button type="button" variant="secondary" size="sm" disabled={loading} onClick={(e) => { e.preventDefault(); (e.currentTarget.parentElement?.querySelector("input") as HTMLInputElement)?.click(); }}>
        Seleccionar archivo
      </Button>
      <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={loading} />
    </label>
  );
}
