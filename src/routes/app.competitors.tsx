import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, Trash2, Package, TrendingUp, TrendingDown, Minus, Search, Upload, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/app/competitors")({ component: CompetitorsPage });

type Competitor = { id: string; name: string };
type Product = { id: string; name: string; price: number | null; category: string | null; competitor_id: string | null; is_mine: boolean; sku: string | null };

// Simple token-based name similarity (Jaccard on lowercased word tokens)
function similarity(a: string, b: string) {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2);
  const A = new Set(norm(a)), B = new Set(norm(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  A.forEach((w) => { if (B.has(w)) inter++; });
  return inter / (A.size + B.size - inter);
}

function CompetitorsPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const { data: competitors = [] } = useQuery({
    queryKey: ["competitors"],
    queryFn: async () => (await supabase.from("competitors").select("*").order("name")).data as Competitor[] || [],
  });
  const { data: products = [] } = useQuery({
    queryKey: ["products", "all"],
    queryFn: async () => (await supabase.from("products").select("id,name,price,category,competitor_id,is_mine,sku").limit(10000)).data as Product[] || [],
  });

  const del = useMutation({
    mutationFn: async (id: string) => { const { error } = await supabase.from("competitors").delete().eq("id", id); if (error) throw error; },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["competitors"] }); qc.invalidateQueries({ queryKey: ["products"] }); setSelected(null); toast.success("Eliminado"); },
  });

  const stats = useMemo(() => {
    const m = new Map<string, { count: number; avg: number; min: number; max: number; cats: number }>();
    competitors.forEach((c) => {
      const prods = products.filter((p) => p.competitor_id === c.id);
      const prices = prods.map((p) => p.price).filter((p): p is number => p != null);
      const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
      const cats = new Set(prods.map((p) => p.category).filter(Boolean)).size;
      m.set(c.id, {
        count: prods.length,
        avg,
        min: prices.length ? Math.min(...prices) : 0,
        max: prices.length ? Math.max(...prices) : 0,
        cats,
      });
    });
    return m;
  }, [competitors, products]);

  const mine = useMemo(() => products.filter((p) => p.is_mine), [products]);
  const minePrices = useMemo(() => mine.map((p) => p.price).filter((p): p is number => p != null), [mine]);
  const avgMine = minePrices.length ? minePrices.reduce((a, b) => a + b, 0) / minePrices.length : 0;

  const selComp = competitors.find((c) => c.id === selected);
  const selProducts = useMemo(() => products.filter((p) => p.competitor_id === selected), [products, selected]);
  const selStats = selected ? stats.get(selected) : null;

  // Per-category comparison for chart
  const compareData = useMemo(() => {
    if (!selected) return [];
    const cats = new Set<string>();
    [...mine, ...selProducts].forEach((p) => p.category && cats.add(p.category));
    return Array.from(cats).slice(0, 8).map((cat) => {
      const m = mine.filter((p) => p.category === cat && p.price).map((p) => p.price!);
      const r = selProducts.filter((p) => p.category === cat && p.price).map((p) => p.price!);
      return {
        name: cat.length > 12 ? cat.slice(0, 11) + "…" : cat,
        Tú: m.length ? Math.round((m.reduce((a, b) => a + b, 0) / m.length) * 100) / 100 : 0,
        Rival: r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) / 100 : 0,
      };
    });
  }, [selected, mine, selProducts]);

  // Product matching: for each rival product, best match in mine
  const matches = useMemo(() => {
    if (!selected || !mine.length || !selProducts.length) return [];
    const out: Array<{ rival: Product; mine: Product; score: number; diff: number; diffPct: number }> = [];
    for (const r of selProducts) {
      if (!r.price) continue;
      let best: { p: Product; score: number } | null = null;
      for (const m of mine) {
        if (!m.price) continue;
        const score = similarity(m.name, r.name);
        if (score >= 0.4 && (!best || score > best.score)) best = { p: m, score };
      }
      if (best) {
        const diff = r.price - best.p.price!;
        out.push({ rival: r, mine: best.p, score: best.score, diff, diffPct: (diff / best.p.price!) * 100 });
      }
    }
    return out.sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  }, [selected, mine, selProducts]);

  const cheaperRival = matches.filter((m) => m.diff < 0).length;
  const moreExpensiveRival = matches.filter((m) => m.diff > 0).length;

  // Filter the visible product list
  const visibleSelProducts = useMemo(() => {
    if (!q) return selProducts;
    const qq = q.toLowerCase();
    return selProducts.filter((p) => p.name.toLowerCase().includes(qq) || (p.sku || "").toLowerCase().includes(qq) || (p.category || "").toLowerCase().includes(qq));
  }, [selProducts, q]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">Competidores</h1>
        <p className="text-muted-foreground mt-1">{competitors.length} detectados · {products.filter((p) => !p.is_mine).length} productos rivales</p>
      </div>

      {competitors.length === 0 ? (
        <div className="glass-strong rounded-3xl p-12 text-center">
          <Users className="size-10 text-primary mx-auto mb-3" />
          <h3 className="text-lg font-medium">Aún no hay competidores</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Sube un Excel de un rival y la IA detectará el nombre automáticamente.</p>
          <Link to="/app/uploads" className="inline-flex items-center gap-2 rounded-full bg-primary text-primary-foreground px-5 py-2.5 text-sm font-medium">
            <Upload className="size-4" /> Subir archivo <ArrowRight className="size-4" />
          </Link>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          <div className="glass rounded-2xl p-2 space-y-1 md:col-span-1 max-h-[80vh] overflow-auto">
            {competitors.map((c) => {
              const s = stats.get(c.id);
              const active = c.id === selected;
              const diff = avgMine && s?.avg ? ((s.avg - avgMine) / avgMine) * 100 : 0;
              return (
                <button key={c.id} onClick={() => setSelected(c.id)} className={`w-full text-left p-3 rounded-xl transition-all ${active ? "bg-primary text-primary-foreground" : "hover:bg-card/60"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium truncate">{c.name}</div>
                    <button onClick={(e) => { e.stopPropagation(); if (confirm(`Borrar ${c.name}?`)) del.mutate(c.id); }} className={`p-1 rounded ${active ? "hover:bg-primary-foreground/10" : "hover:bg-destructive/10 text-muted-foreground hover:text-destructive"}`}>
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className={`text-xs mt-1 flex items-center gap-2 ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}>
                    <span>{s?.count || 0} prod.</span>
                    {s?.avg ? <span>· {s.avg.toFixed(2)}€</span> : null}
                    {avgMine && s?.avg ? (
                      <span className={`ml-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium ${active ? "bg-primary-foreground/15" : diff > 0 ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        {diff > 0 ? "+" : ""}{diff.toFixed(0)}%
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="md:col-span-2 space-y-4">
            {selComp && selStats ? (
              <>
                <div className="glass-strong rounded-2xl p-5">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <h2 className="text-xl font-semibold">{selComp.name}</h2>
                      <p className="text-xs text-muted-foreground mt-1">{selStats.cats} categorías · {selStats.count} productos</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                    <Kpi label="Precio medio" value={selStats.avg ? `${selStats.avg.toFixed(2)}€` : "—"} />
                    <Kpi label="Min – Max" value={selStats.min ? `${selStats.min}€ – ${selStats.max}€` : "—"} />
                    <Kpi label="Diff vs tú" value={avgMine && selStats.avg ? `${((selStats.avg - avgMine) / avgMine * 100).toFixed(1)}%` : "—"} accent={avgMine && selStats.avg ? (selStats.avg > avgMine ? "up" : "down") : undefined} />
                    <Kpi label="Productos comparables" value={matches.length} />
                  </div>
                </div>

                {matches.length > 0 && (
                  <div className="grid grid-cols-3 gap-3">
                    <Mini label="Rival más caro que tú" value={moreExpensiveRival} icon={TrendingUp} color="text-destructive" />
                    <Mini label="Rival más barato" value={cheaperRival} icon={TrendingDown} color="text-primary" />
                    <Mini label="Mismo precio (±2%)" value={matches.filter((m) => Math.abs(m.diffPct) < 2).length} icon={Minus} color="text-muted-foreground" />
                  </div>
                )}

                {compareData.length > 0 && (
                  <div className="glass rounded-2xl p-5">
                    <h3 className="font-medium mb-3">Comparativa por categoría</h3>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={compareData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.92 0.005 25)" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid oklch(0.92 0.005 25)" }} />
                        <Bar dataKey="Tú" fill="oklch(0.4 0.164 29.2)" radius={[6, 6, 0, 0]} />
                        <Bar dataKey="Rival" fill="oklch(0.7 0.1 36)" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}

                {matches.length > 0 && (
                  <div className="glass rounded-2xl p-5">
                    <h3 className="font-medium mb-3">Match producto a producto</h3>
                    <p className="text-xs text-muted-foreground mb-3">La IA empareja por similitud de nombre. Ordenado por mayor diferencia de precio.</p>
                    <div className="space-y-2 max-h-96 overflow-auto">
                      {matches.slice(0, 80).map((m, i) => (
                        <div key={i} className="glass-subtle rounded-xl p-3 grid grid-cols-12 gap-2 text-xs items-center">
                          <div className="col-span-5">
                            <div className="font-medium truncate">{m.mine.name}</div>
                            <div className="text-muted-foreground">Tú · {m.mine.price}€</div>
                          </div>
                          <div className="col-span-5">
                            <div className="font-medium truncate">{m.rival.name}</div>
                            <div className="text-muted-foreground">{selComp.name} · {m.rival.price}€</div>
                          </div>
                          <div className="col-span-2 text-right">
                            <span className={`px-2 py-1 rounded-full font-medium ${m.diff > 0 ? "bg-destructive/10 text-destructive" : m.diff < 0 ? "bg-primary/10 text-primary" : "bg-muted"}`}>
                              {m.diff > 0 ? "+" : ""}{m.diffPct.toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="glass rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
                    <h3 className="font-medium flex items-center gap-2"><Package className="size-4" /> Productos del competidor</h3>
                    <div className="relative w-full md:w-64">
                      <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." className="pl-9 rounded-xl bg-card/60 border-glass-border" />
                    </div>
                  </div>
                  <div className="space-y-1 max-h-96 overflow-auto">
                    {visibleSelProducts.slice(0, 300).map((p) => (
                      <div key={p.id} className="flex justify-between text-sm py-2 border-b border-white/40 gap-3">
                        <div className="min-w-0">
                          <div className="truncate">{p.name}</div>
                          {(p.category || p.sku) && <div className="text-xs text-muted-foreground truncate">{[p.sku, p.category].filter(Boolean).join(" · ")}</div>}
                        </div>
                        <span className="font-medium whitespace-nowrap">{p.price != null ? `${p.price}€` : "—"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <div className="glass rounded-2xl p-12 text-center text-muted-foreground">Selecciona un competidor para ver la comparativa</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, accent }: { label: string; value: string | number; accent?: "up" | "down" }) {
  const color = accent === "up" ? "text-destructive" : accent === "down" ? "text-primary" : "";
  return (
    <div className="glass-subtle rounded-xl p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${color}`}>{value}</div>
    </div>
  );
}

function Mini({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof TrendingUp; color: string }) {
  return (
    <div className="glass-subtle rounded-xl p-3 flex items-center gap-3">
      <Icon className={`size-5 ${color}`} />
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-lg font-semibold">{value}</div>
      </div>
    </div>
  );
}
