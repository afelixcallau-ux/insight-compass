import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/app/competitors")({ component: CompetitorsPage });

type Competitor = { id: string; name: string };
type Product = { id: string; name: string; price: number | null; category: string | null; competitor_id: string | null; is_mine: boolean };

function CompetitorsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => (await supabase.from("competitors").select("*").order("name")).data as Competitor[] || [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => (await supabase.from("products").select("id,name,price,category,competitor_id,is_mine").limit(10000)).data as Product[] || [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("competitors").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors"] }); qc.invalidateQueries({ queryKey: ["products"] }); setSelected(null); toast.success("Eliminado"); },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; avg: number }>();
    competitors.forEach((c) => {
      const prods = products.filter((p) => p.competitor_id === c.id && p.price != null);
      const avg = prods.length ? prods.reduce((a, b) => a + (b.price || 0), 0) / prods.length : 0;
      m.set(c.id, { count: products.filter((p) => p.competitor_id === c.id).length, avg });
    });
    return m;
  }, [competitors, products]);

  const mine = products.filter((p) => p.is_mine);
  const avgMine = mine.length ? mine.filter((p) => p.price).reduce((a, b) => a + (b.price || 0), 0) / mine.filter((p) => p.price).length : 0;

  const selComp = competitors.find((c) => c.id === selected);
  const selProducts = products.filter((p) => p.competitor_id === selected);

  const compareData = useMemo(() => {
    if (!selected) return [];
    const cats = new Set<string>();
    [...mine, ...selProducts].forEach((p) => p.category && cats.add(p.category));
    return Array.from(cats).slice(0, 6).map((cat) => {
      const m = mine.filter((p) => p.category === cat && p.price).map((p) => p.price!);
      const r = selProducts.filter((p) => p.category === cat && p.price).map((p) => p.price!);
      return {
        name: cat,
        "Mi tienda": m.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 100) / 100 : 0,
        [selComp?.name || "Rival"]: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100 : 0,
      };
    });
  }, [selected, mine, selProducts, selComp]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Competidores</h1>
        <p className="text-muted-foreground mt-1">{competitors.length} competidores detectados por la IA</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div className="glass rounded-2xl p-2 space-y-1 md:col-span-1">
          {competitors.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Users className="size-8 mx-auto mb-2 opacity-50" />
              Sube un Excel para empezar
            </div>
          ) : competitors.map((c) => {
            const s = stats.get(c.id);
            const active = c.id === selected;
            return (
              <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 rounded-xl transition-all ${active ? "bg-primary text-primary-foreground" : "hover:bg-card/60"}`}>
                <div className="flex items-center justify-between">
                  <div className="font-medium truncate">{c.name}</div>
                  <button onClick={(e) => { e.stopPropagation(); del.mutate(c.id); }} className={`p-1 rounded ${active ? "hover:bg-primary-foreground/10" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"}`}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                <div className={`text-xs mt-1 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                  {s?.count || 0} productos · {s?.avg ? `${s.avg.toFixed(2)}€ medio` : "—"}
                </div>
              </button>
            );
          })}
        </div>

        <div className="md:col-span-2 space-y-4">
          {selComp ? (
            <>
              <div className="glass-strong rounded-2xl p-5">
                <h2 className="text-xl font-semibold">{selComp.name}</h2>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <Kpi label="Productos" value={selProducts.length} />
                  <Kpi label="Precio medio" value={stats.get(selComp.id)?.avg ? `${stats.get(selComp.id)!.avg.toFixed(2)}€` : "—"} />
                  <Kpi label="Diferencia vs tú" value={avgMine && stats.get(selComp.id)?.avg ? `${((stats.get(selComp.id)!.avg - avgMine) / avgMine * 100).toFixed(1)}%` : "—"} />
                </div>
              </div>

              {compareData.length > 0 && (
                <div className="glass rounded-2xl p-5">
                  <h3 className="font-medium mb-3">Comparativa por categoría</h3>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={compareData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 240)" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.9 0.01 240)" }} />
                      <Bar dataKey="Mi tienda" fill="oklch(0.62 0.17 252)" radius={[6, 6, 0, 0]} />
                      <Bar dataKey={selComp.name} fill="oklch(0.72 0.14 220)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}

              <div className="glass rounded-2xl p-5">
                <h3 className="font-medium mb-3 flex items-center gap-2"><Package className="size-4" /> Productos</h3>
                <div className="space-y-1 max-h-96 overflow-auto">
                  {selProducts.slice(0, 200).map((p) => (
                    <div key={p.id} className="flex justify-between text-sm py-2 border-b border-white/30">
                      <span className="truncate pr-4">{p.name}</span>
                      <span className="font-medium whitespace-nowrap">{p.price != null ? `${p.price}€` : "—"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Selecciona un competidor</div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="glass-subtle rounded-xl p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-1">{value}</div>
    </div>
  );
}
